from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from rabbitmq import setup_connection
from models import response_futures, workers, server_models, download_futures, connections, channels
import threading, json, time

from config import SERVER_QUEUE, WORKER_TIMEOUT

app = FastAPI()
app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

worker_lock = threading.Lock()

def response_listener():
    def callback(channel, method, properties, body):
        correlation_id = properties.correlation_id
        if correlation_id and correlation_id in response_futures:
            future = response_futures.pop(correlation_id)
            future.set_result(json.loads(body))
        channel.basic_ack(delivery_tag=method.delivery_tag)

    try:
        connection, channel = setup_connection()
        channel.queue_declare(queue=SERVER_QUEUE)
        channel.basic_consume(queue=SERVER_QUEUE, on_message_callback=callback)

        channel.start_consuming()
    except Exception as e:
        if channel and channel.is_open:
            channel.close()
            connection.close()
    
def update_server_models():
    server_models.clear()
    all_models = set()
    for worker_info in workers.values():
        all_models.update(worker_info.get("cached_models", set()))
    server_models.update(all_models)

def worker_status_listener():
    def callback(channel, method, properties, body):
        data = json.loads(body)
        worker_id = data.get("worker_id")
        available_models = data.get("available_models", [])
        loaded_models = data.get("loaded_models", [])
        status = data.get("status", "offline")

        with worker_lock:
            if worker_id and status == "online":
                if worker_id not in workers:
                    print(f"Worker {worker_id} is online")
                    workers[worker_id] = {}
                workers[worker_id]["cached_models"] = set(available_models)
                workers[worker_id]["loaded_models"] = set(loaded_models)
                workers[worker_id]["last_seen"] = time.time()
            
            elif worker_id and status == "downloaded":
                key = f"{worker_id}_{data.get('model', '')}"
                fut = download_futures.get(key)
                if fut and not fut.done():
                    fut.set_result(True)


            elif worker_id and status == "offline":
                if worker_id in workers:
                    print(f"Worker {worker_id} is offline")
                    del workers[worker_id]
            
            update_server_models()
        
        channel.basic_ack(delivery_tag=method.delivery_tag)

    connection, channel = setup_connection()
    channel.exchange_declare(exchange='worker_status_exchange', exchange_type='fanout')
    q = channel.queue_declare(queue='', exclusive=True)
    channel.queue_bind(exchange='worker_status_exchange', queue=q.method.queue)
    channel.basic_consume(queue=q.method.queue, on_message_callback=callback)

    try:
        channel.start_consuming()
    except Exception as e:
        if channel and channel.is_open:
            channel.close()
            connection.close()
        print(f"Error in worker status listener: {e}")

def heartbeat_watcher():
    while True:
        current_time = time.time()

        with worker_lock:
            for worker_id, worker_info in list(workers.items()):
                if current_time - worker_info.get("last_seen", 0) > WORKER_TIMEOUT:
                    print(f"Worker {worker_id} has timed out")
                    del workers[worker_id]
            
            update_server_models()

        time.sleep(10)

@app.on_event("startup")
def startup_event():
    threading.Thread(target=response_listener, daemon=True).start()
    threading.Thread(target=worker_status_listener, daemon=True).start()
    threading.Thread(target=heartbeat_watcher, daemon=True).start()

@app.on_event("shutdown")
def shutdown_event():
    for channel in channels.values():
        if channel.is_open:
            channel.close()
    
    for connection in connections.values():
        if connection.is_open:
            connection.close()

    response_futures.clear()
    download_futures.clear()
    print("Server shutdown complete.")