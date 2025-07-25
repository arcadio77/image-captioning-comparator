import uuid, os, logging, aio_pika, asyncio, json, io, base64, sys, functools
from dotenv import load_dotenv
from model_manager import ModelManager
from loguru import logger
from huggingface_hub import repo_info
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

class Worker:
    def __init__(self):
        load_dotenv()
        self.worker_id = uuid.uuid4().hex[:8]
        self.logger = self.setup_logger()
        self.rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
        self.model_manager = ModelManager(self.logger)
        self.cached_consumers = set()
        self.executor = ThreadPoolExecutor()
    
    def setup_logger(self):
        logger.remove()
        logger.add(sys.stderr, enqueue=True)

        class InterceptHandler(logging.Handler):
            def emit(self, record):
                try:
                    level = logger.level(record.levelname).name
                except ValueError:
                    level = record.levelno
                logger.opt(depth=6, exception=record.exc_info).log(level, record.getMessage())
        
        logging.root.handlers = []
        logging.root.setLevel(logging.DEBUG)

        logging.basicConfig(
            level=logging.WARNING,
            handlers=[InterceptHandler()]
        )

        for name in logging.root.manager.loggerDict:
            logging.getLogger(name).handlers = []
            logging.getLogger(name).propagate = True

        return logger
    
    async def start(self):
        self.logger.info(f"Starting worker {self.worker_id}")
        self.model_manager.scan_cache()
        self.connection = await aio_pika.connect_robust(self.rabbitmq_url)
        self.channel = await self.connection.channel()
        await self.channel.set_qos(prefetch_count=1)

        self.status_task = asyncio.create_task(self.status_sender())
        self.control_task = asyncio.create_task(self.control_receiver())
        await self.bind_and_consume()

        try:
            await asyncio.Future()
        except asyncio.CancelledError:
            self.logger.info("Worker shutting down...")
            await self.send_status(status="offline")
            await self.connection.close()
            self.status_task.cancel()
            self.control_task.cancel()
            await asyncio.gather(self.status_task, self.control_task, return_exceptions=True)
            self.logger.info("Worker shutdown complete.")

    async def bind_and_consume(self):
        for model in self.model_manager.cached_models:
            await self.consume_model(model)

    async def consume_model(self, model):
        if model in self.cached_consumers:
            return
        
        queue = await self.channel.declare_queue(model, durable=True)
        await queue.bind("worker_tasks", routing_key=model)
        await queue.consume(lambda msg: self.on_message(msg, model))
        self.cached_consumers.add(model)
        self.logger.info(f"Consumer for model {model} started.")

    async def on_message(self, message: aio_pika.IncomingMessage, model):
        async with message.process():
            msg = json.loads(message.body)
            file_id = msg.get("id")
            image = self.decode_image(msg.get("image"))

            if not image:
                self.logger.error(f"Invalid image data for file ID {file_id}.")
                return

            pipe = await self.run_in_executor(self.model_manager.get_pipeline, model)
            results = []

            try:
                self.logger.debug(f"Processing image with model {model} for file ID {file_id}.")
                if self.model_manager.is_custom_model(model):
                    self.logger.debug(f"Running custom inference for model {model}. {type(pipe)}")
                    result = await self.run_in_executor(pipe.infer, image)
                    results.append({"model": model, "caption": result})
                else:
                    tags = repo_info(model).tags
                    if "image-text-to-text" in tags:
                        self.logger.debug(f"Using image-text-to-text pipeline for model {model}.")
                        inputs = [
                            {
                                "role": "user",
                                "content": [
                                    {"type": "image", "image": image},
                                    {"type": "text", "text": "Generate a caption for the image."}
                                ]
                            }
                        ]
                        output = await self.run_in_executor(pipe, text=inputs)
                        result = ""
                        for item in output:
                            for data in item.get('generated_text', []):
                                if data.get('role') == 'assistant':
                                    result = data.get('content')
                                    break
                        result = result if result else "No caption generated."
                    else:
                        self.logger.debug(f"Using image-to-text pipeline for model {model}.")
                        output = await self.run_in_executor(pipe, image)
                        result = output[0]["generated_text"]
                    results.append({"model": model, "caption": result})
            except Exception as e:
                self.logger.error(f"Error processing image with model {model}: {e}")
                results.append({"model": model, "error": str(e)})
                
            self.logger.debug(f"Results for file ID {file_id}: {results}")
            
            if message.reply_to:
                response = json.dumps({
                    "id": file_id,
                    "results": results
                })

                await self.channel.default_exchange.publish(
                    aio_pika.Message(
                        body=response.encode(),
                        correlation_id=message.correlation_id
                    ),
                    routing_key=message.reply_to
                )

    async def control_receiver(self):
        channel = await self.connection.channel()
        queue_name = f"worker_{self.worker_id}"
        queue = await channel.declare_queue(queue_name, exclusive=True)
        await queue.bind("worker_control", routing_key=self.worker_id)

        async with queue.iterator() as queue_iter:
            async for message in queue_iter:
                async with message.process():
                    msg = json.loads(message.body)
                    action = msg.get("action")
                    model = msg.get("model")

                    self.logger.info(f"Received control message for action '{action}' on model '{model}'.")

                    if action == "download":
                        try:
                            await self.run_in_executor(self.model_manager.download_model, model)
                            await self.consume_model(model)
                            await self.send_status(status="downloaded", additional_info={"model": model})
                        except Exception as e:
                            await self.send_status(status="downloaded", additional_info={"model": model, "error": str(e)})
                    elif action == "unload":
                        self.model_manager.unload_model(model)
                    elif action == "delete":
                        self.model_manager.delete_model(model)
                        self.cached_consumers.discard(model)
                    elif action == "custom":
                        try:
                            await self.run_in_executor(self.model_manager.create_custom_model, model, msg.get("code"))
                            await self.consume_model(model)
                            await self.send_status(status="custom", additional_info={"model": model})
                        except Exception as e:
                            await self.send_status(status="custom", additional_info={"model": model, "error": str(e)})

    async def send_status(self, status="online", additional_info={}):
        channel = await self.connection.channel()
        exchange = await channel.declare_exchange("worker_status_exchange", aio_pika.ExchangeType.FANOUT)

        message = {
            "worker_id": self.worker_id,
            "available_models": list(self.model_manager.cached_models),
            "loaded_models": list(self.model_manager.loaded_models.keys()),
            "status": status,
            **additional_info
        }

        await exchange.publish(
            aio_pika.Message(
                body=json.dumps(message).encode()
            ),
            routing_key="worker_status_exchange"
        )

        await channel.close()

    
    async def status_sender(self):
        while True:
            try:
                await self.send_status()
            except Exception as e:
                self.logger.error(f"Error sending status: {e}")
            await asyncio.sleep(10)

    def decode_image(self, b64):
        try:
            return Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
        except Exception as e:
            self.logger.error(f"Failed to decode image: {e}")
            return None
        
    async def run_in_executor(self, func, *args, **kwargs):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, functools.partial(func, *args, **kwargs))
    
if __name__ == "__main__":
    worker = Worker()
    asyncio.run(worker.start())