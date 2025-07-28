import asyncio, aio_pika, json, time
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import router
from rabbitmq import rabbitmq
from models import response_futures, workers, server_models, download_futures
from logger import logger
from config import SERVER_QUEUE, WORKER_TIMEOUT

app = FastAPI(
    title="Image Captioning Comparator",
)
app.include_router(router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

worker_lock = asyncio.Lock()

async def response_listener():
    channel = await rabbitmq.get_channel("response_listener")
    queue = await channel.declare_queue(SERVER_QUEUE)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                logger.debug(f"Received correlation ID: {message.correlation_id} with body: {message.body}")
                correlation_id = message.correlation_id
                if correlation_id in response_futures:
                    future = response_futures.pop(correlation_id)
                    future.set_result(json.loads(message.body))

async def update_server_models():
    server_models.clear()
    all_models = set()
    for worker_info in workers.values():
        all_models.update(worker_info.get("cached_models", set()))
    server_models.update(all_models)

async def worker_status_listener():
    channel = await rabbitmq.get_channel("worker_status_listener")
    queue = await channel.declare_queue(exclusive=True)
    exchange = await channel.declare_exchange("worker_status_exchange", aio_pika.ExchangeType.FANOUT)
    await queue.bind(exchange)

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                data = json.loads(message.body)
                worker_id = data.get("worker_id")
                available_models = data.get("available_models", [])
                loaded_models = data.get("loaded_models", [])
                status = data.get("status", "offline")
               
                if not worker_id:
                    continue
                logger.info(f"Worker {worker_id} status: {status}")
                async with worker_lock:
                    if status == "online":
                        if worker_id not in workers:
                            print(f"Worker {worker_id} is online")
                            workers[worker_id] = {}
                        workers[worker_id]["cached_models"] = set(available_models)
                        workers[worker_id]["loaded_models"] = set(loaded_models)
                        workers[worker_id]["last_seen"] = time.time()
                    elif status == "downloaded" or status == "custom":
                        key = f"{worker_id}_{data.get('model', '')}"
                        fut = download_futures.get(key)
                        if fut and not fut.done():
                            if "error" in data:
                                fut.set_exception(Exception(data["error"]))
                            else:
                                fut.set_result(True)
                    elif status == "offline" and worker_id in workers:
                        print(f"Worker {worker_id} is offline")
                        del workers[worker_id]
                    
                    await update_server_models()

async def heartbeat_listener():
    while True:
        await asyncio.sleep(10)
        
        async with worker_lock:
            current_time = time.time()
            for worker_id in list(workers.keys()):
                if current_time - workers[worker_id].get("last_seen", 0) > WORKER_TIMEOUT:
                    logger.warning(f"Worker {worker_id} has timed out, removing from workers.")
                    del workers[worker_id]
            await update_server_models()


@app.on_event("startup")
async def startup_event():
    await rabbitmq.get_channel("publisher")
    asyncio.create_task(response_listener())
    logger.info("Response listener started")
    asyncio.create_task(worker_status_listener())
    logger.info("Worker status listener started")
    asyncio.create_task(heartbeat_listener())
    logger.info("Heartbeat listener started")

@app.on_event("shutdown")
async def shutdown_event():
    await rabbitmq.close()
    logger.info("RabbitMQ connection closed")
    response_futures.clear()
    download_futures.clear()