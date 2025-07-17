from fastapi import APIRouter, UploadFile
from typing import List
import base64, json, asyncio
from pika import BasicProperties

from models import workers, server_models, response_futures
from utils import is_valid_model
from rabbitmq import setup_connection, publish_message
from collections import defaultdict
from config import SERVER_QUEUE
from models import download_futures

router = APIRouter()

@router.get("/workers")
def get_workers():
    return {
        "workers": [{
            "id": worker_id,
            "cached_models": list(worker["cached_models"]), 
            "loaded_models": list(worker["loaded_models"])
        } for worker_id, worker in workers.items()]
    }

@router.get("/models")
def get_models():
    print(server_models)
    return {"models": sorted(list(server_models))}

@router.post("/download_model")
async def download_model(worker: str, model: str):
    if not is_valid_model(model):
        return {"error": "Model not found or not an image-to-text model."}
    
    if not worker in workers:
        return {"error": "Worker not found."}

    if model in workers[worker]["cached_models"]:
        return {"status": "Model already cached on worker."}
    
    key=f"{worker}_{model}"
    loop = asyncio.get_event_loop()
    fut = loop.create_future()
    download_futures[key] = fut
    
    publish_message('worker_control', worker, {
        "action": "download",
        "model": model
    })

    try:
        await asyncio.wait_for(fut, timeout=None)
    except Exception as e:
        del download_futures[key]
        return {"error": f"Failed to download model: {str(e)}"}
    
    del download_futures[key]


    return {"status": "Model downloaded."}

@router.post("/unload_model")
def unload_model(worker: str, model: str):
    if worker not in workers:
        return {"error": "Worker not found."}
    if model not in workers[worker]["loaded_models"]:
        return {"error": "Model not loaded on worker."}
    
    publish_message('worker_control', worker, {
        "action": "unload",
        "model": model
    })

    return {"status": "Model unload command sent to worker."}

@router.post("/upload")
async def upload_images(files: List[UploadFile], ids: List[str], models: List[str]):
    models = models[0].split(",")
    ids = ids[0].split(",")


    valid_models = [model for model in models if model in server_models]
    loop = asyncio.get_event_loop()
    futures = {f"{file_id}_{model}": loop.create_future() for file_id in ids for model in valid_models}
    response_futures.update(futures)

    connection, channel = setup_connection()

    for i, file in enumerate(files):
        file_id = ids[i]
        content = await file.read()
        b64 = base64.b64encode(content).decode('utf-8')

        for model in valid_models:
            channel.basic_publish(
                exchange='worker_tasks',
                routing_key=model,
                body=json.dumps({"id": file_id, "image": b64, "model": model}),
                properties=BasicProperties(
                    correlation_id=f"{file_id}_{model}",
                    reply_to=SERVER_QUEUE
                )
            )
    
    async def wait_for_responses(file_id, fut):
        return await asyncio.wait_for(fut, timeout=None)
        
    results = await asyncio.gather(
        *[wait_for_responses(file_id, fut) for file_id, fut in futures.items()]
    )

    # TODO: Remove it after implementing streaming response
    grouped = defaultdict(list)
    for item in results:
        grouped[item["id"]].append(item)

    merged_results = []
    for id_, items in grouped.items():
        combined = {"id": id_, "results": []}
        for item in items:
            if "results" in item:
                combined["results"].extend(item["results"])
        merged_results.append(combined)

    connection.close()

    return {"results": merged_results}
    # Streaming response
    # async def result_stream():
    #     try:
    #         # map future -> file_id
    #         future_to_id = {fut: fid for fid, fut in futures.items()}
    #         for fut in asyncio.as_completed(futures.values()):
    #             try:
    #                 result = await fut
    #             except asyncio.TimeoutError:
    #                 result = {"id": future_to_id[fut], "error": "Timeout"}
    #             yield (json.dumps(result) + "\n").encode("utf-8")
    #     finally:
    #         conn.close()

    # return StreamingResponse(result_stream(), media_type="application/json")