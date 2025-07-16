from fastapi import FastAPI, UploadFile, File
from typing import List
import os, pika, base64, json, asyncio, threading
from dotenv import load_dotenv
from huggingface_hub import repo_exists, repo_info
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from collections import defaultdict

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
SERVER_QUEUE = os.getenv("SERVER_QUEUE", "response_queue")
response_futures = {}
server_models = set()
workers = {}

def setup_connection():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    channel.exchange_declare(exchange='worker_tasks', exchange_type='topic')

    channel.queue_declare(queue=SERVER_QUEUE)
    channel.queue_declare(queue="worker_status_queue")
    return connection, channel

def start_response_listener():
    def callback(ch, method, props, body):
        correlation_id = props.correlation_id
        if correlation_id and correlation_id in response_futures:
            future = response_futures.pop(correlation_id)
            future.set_result(json.loads(body))
        ch.basic_ack(delivery_tag=method.delivery_tag)

    conn, ch = setup_connection()
    ch.basic_consume(queue=SERVER_QUEUE, on_message_callback=callback)

    ch.start_consuming()

def listen_worker_status():
    def callback(ch, method, props, body):
        global workers, server_models

        data = json.loads(body)
        worker_id = data.get("worker_id")
        available_models = data.get("available_models", [])
        status = data.get("status", "offline")

        if worker_id and status == "online":
            if worker_id not in workers:
                print(f"Worker {worker_id} is online")
            workers[worker_id] = set(available_models)

        elif worker_id and status == "offline":
            if worker_id in workers:
                print(f"Worker {worker_id} is offline")
                del workers[worker_id]

        if workers:
            server_models = set.union(*workers.values())
        else:
            server_models = set()

        ch.basic_ack(delivery_tag=method.delivery_tag)

    conn, ch = setup_connection()
    ch.exchange_declare(exchange='worker_status_exchange', exchange_type='fanout')

    result = ch.queue_declare(queue='', exclusive=True)
    queue_name = result.method.queue

    ch.queue_bind(exchange='worker_status_exchange', queue=queue_name)

    ch.basic_consume(queue=queue_name, on_message_callback=callback)
    ch.start_consuming()

def send_command_to_worker(worker_id, command, model=""):
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    channel.exchange_declare(exchange='worker_control', exchange_type='topic')
    
    msg = {
        "action": command,
        "model": model
    }

    channel.basic_publish(
        exchange='worker_control',
        routing_key=worker_id,
        body=json.dumps(msg),
    )

    connection.close()

@app.on_event("startup")
def start_listener_thread():
    threading.Thread(target=start_response_listener, daemon=True).start()
    threading.Thread(target=listen_worker_status, daemon=True).start()

@app.get("/workers")
def get_workers():
    return {"workers": [{"id": worker_id, "models": list(models)} for worker_id, models in workers.items()]}

@app.post("/download_model")
def download_model(model: str, worker: str):
    """
    Downloads a model to a specific worker if it exists and is an image-to-text model.
    """
    if repo_exists(model) and "image-to-text" in repo_info(model).tags:
        if worker in workers:
            if model not in workers[worker]:
                send_command_to_worker(worker, "download", model)
                return {"status": "Model download command sent to worker."}
            else:
                return {"status": "Model already cached on worker."}
    else:
        return {"error": "Model not found or not an image-to-text model."}

@app.get("/models")
def get_models():
    return {"models": sorted(list(server_models))}

@app.post("/upload")
async def upload_images(files: List[UploadFile], models: List[str], ids: List[str]):
    models = models[0].split(",")
    ids = ids[0].split(",")

    correct_models = []
    for model in models:
        if model in server_models:
            correct_models.append(model)
        elif repo_exists(model) and "image-to-text" in repo_info(model).tags:
            correct_models.append(model)

    loop = asyncio.get_event_loop()
    futures = {}
    for file_id in ids:
        for model in correct_models:
            future = loop.create_future()
            futures[f"{file_id}_{model}"] = future
            response_futures[f"{file_id}_{model}"] = future

    conn, ch = setup_connection()

    for i, file in enumerate(files):
        file_id = ids[i]
        contents = await file.read()
        encoded = base64.b64encode(contents).decode('utf-8')

        for model in correct_models:
            message = {
                "id": file_id,
                "image": encoded,
                "model": model
            }

            ch.basic_publish(
                exchange='worker_tasks',
                routing_key=model,
                body=json.dumps(message),
                properties=pika.BasicProperties(
                    correlation_id=f"{file_id}_{model}",
                    reply_to=SERVER_QUEUE
                )
            )

    async def wait_with_timeout(file_id, fut):
        try:
            result = await asyncio.wait_for(fut, timeout=None)
        except asyncio.TimeoutError:
            result = {"id": file_id, "error": "Timeout"}
        return result

    results = await asyncio.gather(
        *[wait_with_timeout(file_id, fut) for file_id, fut in futures.items()]
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

    conn.close()    
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