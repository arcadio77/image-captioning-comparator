from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from rabbitmq import setup_connection
from models import response_futures, workers, server_models
import threading, json

from config import SERVER_QUEUE

app = FastAPI()
app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def response_listener():
    def callback(channel, method, properties, body):
        correlation_id = properties.correlation_id
        if correlation_id and correlation_id in response_futures:
            future = response_futures.pop(correlation_id)
            future.set_result(json.loads(body))
        channel.basic_ack(delivery_tag=method.delivery_tag)
    
    connection, channel = setup_connection()
    channel.basic_consume(queue=SERVER_QUEUE, on_message_callback=callback)

    channel.start_consuming()

def worker_status_listener():
    def callback(channel, method, properties, body):
        data = json.loads(body)
        worker_id = data.get("worker_id")
        available_models = data.get("available_models", [])
        loaded_models = data.get("loaded_models", [])
        status = data.get("status", "offline")

        if worker_id and status == "online":
            if worker_id not in workers:
                print(f"Worker {worker_id} is online")
                workers[worker_id] = {}
            workers[worker_id]["cached_models"] = set(available_models)
            workers[worker_id]["loaded_models"] = set(loaded_models) 

        elif worker_id and status == "offline":
            if worker_id in workers:
                print(f"Worker {worker_id} is offline")
                del workers[worker_id]
        
        server_models.clear()
        all_models = set()
        for worker_info in workers.values():
            all_models.update(worker_info.get("cached_models", set()))
        server_models.update(all_models)
        
        channel.basic_ack(delivery_tag=method.delivery_tag)

    _, channel = setup_connection()
    channel.exchange_declare(exchange='worker_status_exchange', exchange_type='fanout')
    q = channel.queue_declare(queue='', exclusive=True)
    channel.queue_bind(exchange='worker_status_exchange', queue=q.method.queue)
    channel.basic_consume(queue=q.method.queue, on_message_callback=callback)
    channel.start_consuming()

@app.on_event("startup")
def startup_event():
    threading.Thread(target=response_listener, daemon=True).start()
    threading.Thread(target=worker_status_listener, daemon=True).start()