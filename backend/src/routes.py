from fastapi import APIRouter, UploadFile, HTTPException, Form, File
from typing import List
import base64, json, asyncio, os
from models import workers, server_models, response_futures, download_futures
from utils import is_valid_model
from rabbitmq import rabbitmq
from collections import defaultdict
from config import SERVER_QUEUE

router = APIRouter()

@router.get("/workers", summary="List all workers", response_description="List of workers with their cached and loaded models")
async def get_workers():
    """Returns a list of all active workers with their cached and loaded models."""
    return {
        "workers": [{
            "id": worker_id,
            "cached_models": list(worker.get("cached_models", [])),
            "loaded_models": list(worker.get("loaded_models", [])),
        } for worker_id, worker in workers.items()],
    }

@router.get("/models", summary="List available models", response_description="List of available models on the server")
async def get_models():
    """
    Returns a sorted list of all models available on the server.
    """
    return {"models": sorted(list(server_models))}

@router.delete("/delete_model", summary="Delete cached model from a worker")
async def delete_model(worker:str, model: str):
    """
    Sends a command to a worker to delete a cached model.

    - **worker**: ID of the worker
    - **model**: Name of the model to delete
    """

    if not is_valid_model(model):
        raise HTTPException(status_code=400, detail="Model not found or not an image-to-text model.")
    if worker not in workers:
        raise HTTPException(status_code=404, detail="Worker not found.")
    if model not in workers[worker]["cached_models"]:
        raise HTTPException(status_code=404, detail="Model not cached on worker.")

    await rabbitmq.publish_message('worker_control', worker, {"action": "delete", "model": model})

    if not any(
        model in worker_info["cached_models"]
        for worker_id, worker_info in workers.items()
        if worker_id != worker
    ):
        ch = await rabbitmq.get_channel("default")
        await ch.queue_delete(model)

    return {"status": "Model deletion command sent to worker."}


@router.post("/download_model", summary="Download model to worker")
async def download_model(worker: str, model: str):
    """
    Sends a command to download a model to the specified worker.

    - **worker**: ID of the worker
    - **model**: Name of the model to download
    """
     
    if not is_valid_model(model):
        raise HTTPException(status_code=400, detail="Model not found or not an image-to-text model.")
    if worker not in workers:
        raise HTTPException(status_code=404, detail="Worker not found.")
    if model in workers[worker]["cached_models"]:
        raise HTTPException(status_code=400, detail="Model already cached on worker.")

    key = f"{worker}_{model}"
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    download_futures[key] = fut

    await rabbitmq.publish_message('worker_control', worker, {"action": "download", "model": model})

    try:
        await asyncio.wait_for(fut, timeout=None)
    except Exception as e:
        del download_futures[key]
        raise HTTPException(status_code=500, detail=f"Error downloading model: {str(e)}")

    del download_futures[key]
    return {"status": "Model downloaded."}

@router.post("/unload_model", summary="Unload loaded model from a worker")
async def unload_model(worker: str, model: str):
    """
    Sends a command to unload a loaded model from the worker.

    - **worker**: ID of the worker
    - **model**: Name of the model to unload
    """
    if worker not in workers:
        raise HTTPException(status_code=404, detail="Worker not found.")
    if model not in workers[worker]["loaded_models"]:
        raise HTTPException(status_code=404, detail="Model not loaded on worker.")

    await rabbitmq.publish_message('worker_control', worker, {"action": "unload", "model": model})
    return {"status": "Model unload command sent to worker."}

@router.post("/upload", summary="Upload images for processing")
async def upload_images(files: List[UploadFile], ids: List[str], models: List[str]):
    """
    Upload images to be processed by specific models.

    - **files**: List of image files (jpeg, png, bmp, webp)
    - **ids**: Comma-separated list of image identifiers (one per file)
    - **models**: Comma-separated list of model names
    """
    models = models[0].split(",")
    ids = ids[0].split(",")

    for file in files:
        if file.content_type not in ["image/jpeg", "image/png", "image/bmp", "image/webp"]:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    valid_models = [model for model in models if model in server_models]
    loop = asyncio.get_event_loop()
    futures = {f"{file_id}_{model}": loop.create_future() for file_id in ids for model in valid_models}
    response_futures.update(futures)

    for i, file in enumerate(files):
        file_id = ids[i]
        content = await file.read()
        b64 = base64.b64encode(content).decode('utf-8')

        for model in valid_models:
            await rabbitmq.publish_message(
                exchange_name='worker_tasks',
                routing_key=model,
                message={"id": file_id, "image": b64, "model": model},
                properties={
                    "correlation_id": f"{file_id}_{model}",
                    "reply_to": SERVER_QUEUE
                }
            )

    results = await asyncio.gather(*[fut for fut in futures.values()])

    grouped = defaultdict(list)
    for item in results:
        grouped[item["id"]].append(item)

    merged_results = []
    for id_, items in grouped.items():
        combined = {"id": id_, "results": []}
        for item in items:
            combined["results"].extend(item.get("results", []))
        merged_results.append(combined)

    return {"results": merged_results}

@router.post("/download_custom_model", summary="Download and register a custom model")
async def download_custom_model(worker: str = Form(...), model: str = Form(...), code_file: UploadFile = File(...)):
    """
    Uploads a Python source file to register a custom model on a specified worker.

    The uploaded .py file should contain code that downloads, initializes,
    and performs inference with a custom model from the Hugging Face Hub.

    - **worker**: ID of the worker
    - **model**: Name to assign to the custom model
    - **code_file**: A .py file containing the Hugging Face model loading and inference logic.
    """
    if not is_valid_model(model):
        raise HTTPException(status_code=400, detail="Model not found or not an image-to-text model.")
    if worker not in workers:
        raise HTTPException(status_code=404, detail="Worker not found.")
    if model in workers[worker]["cached_models"]:
        raise HTTPException(status_code=400, detail="Model already cached on worker.")
    
    try:
        code_bytes = await code_file.read()
        code = code_bytes.decode("utf-8")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read code file: {str(e)}")
    
    key = f"{worker}_{model}"
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    download_futures[key] = fut

    await rabbitmq.publish_message(
        'worker_control',
        worker,
        {
            "action": "custom",
            "model": model,
            "code": code,
        }
    )

    try:
        await asyncio.wait_for(fut, timeout=None)
    except Exception as e:
        del download_futures[key]
        raise HTTPException(status_code=500, detail=f"Custom model error: {str(e)}")

    del download_futures[key]
    return {"status": "Custom model downloaded."}