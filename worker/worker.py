import pika, os, io, json, base64, uuid, time, threading, torch, shutil, sys, logging
from PIL import Image
from dotenv import load_dotenv
from transformers import pipeline
from huggingface_hub import scan_cache_dir, repo_exists, repo_info, snapshot_download
from huggingface_hub.errors import CacheNotFound
from loguru import logger

class Worker:
    def __init__(self):
        load_dotenv()
        self.loaded_models = {} # model_name -> pipeline
        self.cached_models = set() # names of models in cache (not loaded yet)
        self.sending_status = True # Flag to control status sending to server
        self.worker_id = uuid.uuid4().hex[:8]  # Unique worker ID
        self.rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
        self.worker_queue = None
        self.consumer_tags = {}
        self.is_running = True
        # RabbitMQ connection and channel for task processing
        self.connection = None
        self.channel = None
        # RabbitMQ connection and channel for control messages (e.g., downloading models)
        self.channel_control = None
        self.connection_control = None
        # Flag to indicate if the worker is consuming messages from task queues
        self.is_consuming = False
        self.logger = self.setup_logger()
        
        self.logger.info(f"Worker initialized with ID: {self.worker_id}")
        
    
    def start(self):
        self.scan_cache()
        self.setup_control_connection()
        threading.Thread(target=self.status_sender, daemon=True).start()
        threading.Thread(target=self.start_control_consumer, daemon=True).start()
        self.watch_model_availability()

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

    def watch_model_availability(self):
        while self.is_running:
            try:
                if self.cached_models and not self.is_consuming:
                    self.logger.info("Starting worker consumer...")
                    self.setup_task_connection()
                    self.bind_to_models()
                    self.is_consuming = True
                    self.start_consumer()
                time.sleep(3)
            except KeyboardInterrupt:
                self.send_status(status="offline")
                self.logger.info("Worker stopped by user.")
                break

    # Bind the worker to a specific model queue
    def bind_to_model(self, model_name):
        self.logger.info(f"Binding to model: {model_name}")
        self.channel.queue_declare(queue=model_name, durable=True)
        self.channel.queue_bind(exchange='worker_tasks', queue=model_name, routing_key=model_name)

    def setup_task_connection(self):
        self.logger.info(f"Setting up RabbitMQ connection...")
        if not self.connection or not self.connection.is_open:
            params = pika.URLParameters(self.rabbitmq_url)
            self.connection = pika.BlockingConnection(params)
            self.channel = self.connection.channel()
            self.channel.exchange_declare(exchange='worker_tasks', exchange_type='topic')
    
    def bind_to_models(self):
        if not self.connection or not self.connection.is_open:
            self.setup_task_connection()
        
        for model in self.cached_models:
           self.bind_to_model(model)
           self.consume_model(model)
            

    def setup_control_connection(self):
        params = pika.URLParameters(self.rabbitmq_url)
        connection_control = None

        try:
            connection_control = pika.BlockingConnection(params)
            channel_control = connection_control.channel()
            channel_control.exchange_declare(exchange='worker_control', exchange_type='topic') # Exchange for controlling workers e.g. downloading models 
            channel_control.queue_declare(queue=f'worker_{self.worker_id}', exclusive=True)  # Queue for controlling worker
            channel_control.queue_bind(exchange='worker_control', queue=f'worker_{self.worker_id}', routing_key=f'{self.worker_id}')
            self.worker_queue = f'worker_{self.worker_id}'

            self.connection_control = connection_control
            self.channel_control = channel_control

            self.logger.info(f"RabbitMQ control connection established.")

        except Exception as e:
            self.logger.error(f"Error setting up RabbitMQ controll connection: {e}")
            if connection_control and not connection_control.is_closed:
                connection_control.close()
            raise e
        
    def unload_model(self, model_name):
        if model_name in self.loaded_models:
            del self.loaded_models[model_name]
            torch.cuda.empty_cache()  # Clear GPU memory if using CUDA
            self.send_status()
            self.logger.info(f"Model {model_name} unloaded.")
        else:
            self.logger.warning(f"Model {model_name} is not loaded. Cannot unload.")
    
    def delete_model(self, model_name):    
        consumer_tag = self.consumer_tags.get(model_name, None)
        if consumer_tag:
            self.connection.add_callback_threadsafe(lambda: self.channel.basic_cancel(consumer_tag))
        
        if model_name in self.consumer_tags:
            del self.consumer_tags[model_name]
        if model_name in self.loaded_models:
            del self.loaded_models[model_name]
        
        try:
            self.cached_models.remove(model_name)
        except KeyError:
            self.logger.warning(f"Model {model_name} not found in cached models.")

        try:
            snapshot_path = snapshot_download(model_name, local_files_only=True)
            model_path = os.path.abspath(os.path.join(snapshot_path, "..", ".."))
            shutil.rmtree(model_path)
            self.send_status()
            self.logger.info(f"Model {model_name} deleted from cache.")
        except Exception as e:
            cache_dir = os.getenv("HF_HOME", os.path.expanduser("~/.cache/huggingface"))
            formatted_model_name = model_name.replace("/", "--")
            model_cache_dir = os.path.join(cache_dir, "hub", f"models--{formatted_model_name}")

            if os.path.exists(model_cache_dir):
                try:
                    shutil.rmtree(model_cache_dir)
                    self.logger.info(f"Model {model_name} deleted from cache.")
                except Exception as e:
                    self.logger.error(f"Error deleting model {model_name} from cache directory: {e}")
            return
        
    def consume_model(self, model):
        consumer_tag = self.channel.basic_consume(
            queue=model,
            on_message_callback=self.callback,
            auto_ack=False
        )
        self.logger.info(f"Started consuming messages for model: {model}")
        self.consumer_tags[model] = consumer_tag
    
    # Download a model from Hugging Face and bind worker to queue for that model
    def download_model(self, model_name):
        if model_name not in self.cached_models:
            try:
                self.loaded_models[model_name] = pipeline("image-to-text", model=model_name, torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
                self.cached_models.add(model_name)
                self.setup_task_connection()
                self.connection.add_callback_threadsafe(lambda: self.bind_to_model(model_name))
                self.connection.add_callback_threadsafe(lambda: self.consume_model(model_name))
                self.send_status(status="downloaded", additional_info={"model": model_name})
                self.logger.info(f"Model {model_name} downloaded and added to cache.")
            except Exception as e:
                self.logger.error(f"Error downloading model {model_name}: {e}")
                self.delete_model(model_name)
                self.send_status(status="downloaded", additional_info={"model": model_name, "error": str(e)})
        else:
            self.logger.warning(f"Model {model_name} is already cached. Skipping download.")

    def start_control_consumer(self):
        def control_callback(ch, method, properties, body):
            message = json.loads(body)
            action = message.get("action", "")
            model = message.get("model", "")
            self.logger.info(f"Received control message: {message}")
            if action == "download" and model:
                threading.Thread(target=self.download_model, args=(model,), daemon=True).start()
            elif action == "unload" and model:
                threading.Thread(target=self.unload_model, args=(model,), daemon=True).start()
            elif action == "delete" and model:
                threading.Thread(target=self.delete_model, args=(model,), daemon=True).start()
            else:
                self.logger.warning(f"Unknown action: {action} for model: {model}")

            ch.basic_ack(delivery_tag=method.delivery_tag)

        try:
            self.channel_control.basic_consume(
                queue=self.worker_queue,
                on_message_callback=control_callback,
                auto_ack=False
            )
            self.logger.info("Control consumer started. Waiting for control messages...")
            self.channel_control.start_consuming()
        except KeyboardInterrupt:
            self.logger.info("Control consumer stopped by user.")
        except Exception as e:
            print(f"Error in control consumer: {e}")
            self.logger.error(f"Error in control consumer: {e}")
        finally:
            self.logger.info("Closing control RabbitMQ connection...")
            if self.connection_control and not self.connection_control.is_closed:
                self.connection_control.close()

    def start_consumer(self):
        try:
            for model in self.cached_models:
                consumer_tag = self.channel.basic_consume(
                    queue=model,
                    on_message_callback=self.callback,
                    auto_ack=False
                )
                self.consumer_tags[model] = consumer_tag
            self.logger.info(f"Started consuming messages for models: {', '.join(self.cached_models)}")
            self.channel.start_consuming()
                
        except KeyboardInterrupt:
            self.logger.info("Worker stopped by user.")
            self.is_running = False
        except Exception as e:
            self.logger.error(f"Error in worker consumer: {e}")
        finally:
            self.is_consuming = False
            self.logger.info("Closing RabbitMQ connection...")
            if self.connection and not self.connection.is_closed:
                self.connection.close()
    
    def callback(self, ch, method, properties, body):
        message = json.loads(body)
        image = self.decode_image(message.get("image", None))
        file_id = message.get("id", "unknown")
        model = message.get("model", "")

        self.logger.info(f"Received message for file ID: {file_id} with model: {model}")
        
        if not image:
            self.logger.warning(f"Invalid image data for file ID: {file_id}. Skipping processing.")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        results = []

        self.logger.info(f"Processing model {model} for file ID: {file_id}")
        if model not in self.loaded_models:
            try:
                self.loaded_models[model] = pipeline("image-to-text", model=model, torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
                self.logger.info(f"Model {model} loaded successfully.")
            except Exception as e:
                self.logger.error(f"Error loading model {model}: {e}")
                return
        
        pipe = self.loaded_models[model]
        try:
            result = pipe(image)[0]["generated_text"]
            self.logger.info(f"Caption generated for {file_id} using {model}: {result}")
            results.append({"model": model, "caption": result})
        except Exception as e:
            self.logger.error(f"Error processing image with model {model}: {e}")
            results.append({"model": model, "caption": str(e)})

        response_body = json.dumps({
            "id": file_id,
            "results": results
        })

        if properties.reply_to:
            ch.basic_publish(
                exchange='',
                routing_key=properties.reply_to, 
                properties=pika.BasicProperties(
                    correlation_id=properties.correlation_id
                ),
                body=response_body,
            )

        ch.basic_ack(delivery_tag=method.delivery_tag)


    # Decode base64 image data
    def decode_image(self, b64_data):
        try:
            return Image.open(io.BytesIO(base64.b64decode(b64_data))).convert("RGB")
        except Exception as e:
            self.logger.error(f"Error decoding image: {e}")
            return None
    
    # Continuously send status updates to the server
    def status_sender(self):
        while self.sending_status:
            self.send_status(status="online")
            time.sleep(10)

    # Scan the cache directory for models and filter for image-to-text models from huggingface
    def scan_cache(self):
        try:
            repos = scan_cache_dir().repos
        except CacheNotFound:
            self.cached_models = set()
            self.logger.warning("Cache directory not found. No models cached.")
            return
        for repo in repos:
            model = repo.repo_id
            if repo_exists(model) and "image-to-text" in repo_info(model).tags:
                self.cached_models.add(model)
        
        self.logger.info(f"Cached models: {self.cached_models}")
    
    # Send the worker's status to the server
    def send_status(self, status="online", additional_info={}):
        params = pika.URLParameters(self.rabbitmq_url)
        conn = pika.BlockingConnection(params)
        ch = conn.channel()

        msg = {
            "worker_id": self.worker_id,
            "available_models": list(self.cached_models),
            "loaded_models": list(self.loaded_models.keys()),
            "status": status,
            **additional_info
        }
        
        ch.exchange_declare(exchange="worker_status_exchange", exchange_type="fanout") # Send status to all servers


        ch.basic_publish(
            exchange='worker_status_exchange',
            routing_key='',
            body=json.dumps(msg)
        )

        conn.close()

if __name__ == "__main__":
    worker = Worker()
    worker.start()