from fastapi import FastAPI, UploadFile, File
from typing import List
import os, pika, base64, json, asyncio, threading
from dotenv import load_dotenv
from huggingface_hub import repo_exists, repo_info
from fastapi.middleware.cors import CORSMiddleware

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
response_futures = {}

server_models = set()

def setup_connection():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    channel.queue_declare(queue='image_queue')
    channel.queue_declare(queue='response_queue')
    return connection, channel

def start_response_listener():
    def callback(ch, method, props, body):
        correlation_id = props.correlation_id
        if correlation_id and correlation_id in response_futures:
            future = response_futures.pop(correlation_id)
            future.set_result(json.loads(body))
        ch.basic_ack(delivery_tag=method.delivery_tag)

    conn, ch = setup_connection()
    ch.basic_consume(queue='response_queue', on_message_callback=callback)

    ch.start_consuming()

@app.on_event("startup")
def start_listener_thread():
    try:
        threading.Thread(target=start_response_listener, daemon=True).start()
    except Exception as e:
        print("Startup error:", e)

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
            server_models.add(model)

    conn, ch = setup_connection()
    results = []

    for i, file in enumerate(files):
        file_id = ids[i]
        contents = await file.read()
        encoded = base64.b64encode(contents).decode('utf-8')

        future = asyncio.get_event_loop().create_future()
        response_futures[file_id] = future

        message = {
            "id": file_id,
            "image": encoded,
            "models": correct_models
        }

        ch.basic_publish(
            exchange='',
            routing_key='image_queue',
            body=json.dumps(message),
            properties=pika.BasicProperties(
                correlation_id=file_id,
                reply_to='response_queue'
            )
        )

        try:
            result = await asyncio.wait_for(future, timeout=30.0)
        except asyncio.TimeoutError:
            result = {"id": file_id, "error": "Timeout"}
        
        results.append(result)

    conn.close()
    return {"results": results}
