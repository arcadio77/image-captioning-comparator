import pika, os, io, json, base64, uuid, time, threading
from PIL import Image
from dotenv import load_dotenv
from transformers import pipeline
from huggingface_hub import scan_cache_dir, repo_exists, repo_info

class Worker:
    def __init__(self):
        load_dotenv()
        self.loaded_models = {} # model_name -> pipeline
        self.cached_models = set() # names of models in cache
        self.sending_status = True # Flag to control status sending to server
        self.worker_id = uuid.uuid4().hex[:8]  # Unique worker ID
        self.rabbitmq_url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
        self.worker_queue = None
        self.connection = None
        self.channel = None
        self.channel_control = None
        self.connection_control = None
    
    def start(self):
        self.scan_cache()
        self.setup_connection()
        for model in self.cached_models:
            self.bind_to_model(model)
        threading.Thread(target=self.status_sender, daemon=True).start()
        threading.Thread(target=self.start_control_consumer, daemon=True).start()
        self.start_consumer()

    def bind_to_model(self, model_name):
        self.channel.queue_declare(queue=model_name, durable=True)
        self.channel.queue_bind(exchange='worker_tasks', queue=model_name, routing_key=model_name)


    def setup_connection(self):
        params = pika.URLParameters(self.rabbitmq_url)
        connection = None

        try:
            connection = pika.BlockingConnection(params)
            channel = connection.channel()

            channel.exchange_declare(exchange='worker_tasks', exchange_type='topic') # Exchange for inference tasks
            
            connection_control = pika.BlockingConnection(params)
            channel_control = connection_control.channel()
            channel_control.exchange_declare(exchange='worker_control', exchange_type='topic') # Exchange for controlling workers e.g. downloading models 
            channel_control.queue_declare(queue=f'worker_{self.worker_id}', exclusive=True)  # Queue for controlling worker
            channel_control.queue_bind(exchange='worker_control', queue=f'worker_{self.worker_id}', routing_key=f'{self.worker_id}')
            self.worker_queue = f'worker_{self.worker_id}'

            self.connection = connection
            self.channel = channel
            self.connection_control = connection_control
            self.channel_control = channel_control

        except Exception as e:
            print(f"Error setting up RabbitMQ connection: {e}")
            if connection and not connection.is_closed:
                connection.close()
            raise e
    
    def start_control_consumer(self):
        def control_callback(ch, method, properties, body):
            message = json.loads(body)
            action = message.get("action", "")
            model = message.get("model", "")

            def download_model():
                if model not in self.cached_models:
                    try:
                        self.loaded_models[model] = pipeline("image-to-text", model=model)
                        self.cached_models.add(model)
                        self.bind_to_model(model)
                        self.register_new_model_consumer(model)
                        self.send_status()
                        print(f"Model {model} downloaded and added to cache.")
                    except Exception as e:
                        print(f"Error downloading model {model}: {e}")
                else:
                    print(f"Model {model} is already cached.")

            if action == "download" and model:
                threading.Thread(target=download_model, daemon=True).start()

            ch.basic_ack(delivery_tag=method.delivery_tag)

        try:
            self.channel_control.basic_consume(
                queue=self.worker_queue,
                on_message_callback=control_callback,
                auto_ack=False
            )

            self.channel_control.start_consuming()
        except KeyboardInterrupt:
            print("Control consumer stopped by user.")
        except Exception as e:
            print(f"Error in control consumer: {e}")
        finally:
            if self.connection_control and not self.connection_control.is_closed:
                self.connection_control.close()
            
    def register_new_model_consumer(self, model):
        def callback_wrapper():
            self.channel.basic_consume(
                queue=model,
                on_message_callback=self.callback,
                auto_ack=False
            )
        self.connection.add_callback_threadsafe(callback_wrapper)

    def start_consumer(self):
        try:
            for model in self.cached_models:
                self.channel.basic_consume(
                    queue=model,
                    on_message_callback=self.callback,
                    auto_ack=False
                )
            self.channel.start_consuming()
        except KeyboardInterrupt:
            print("Worker stopped by user.")
        except Exception as e:
            print(f"Error in worker: {e}")
        finally:
            if self.connection and not self.connection.is_closed:
                self.send_status(status="offline")
                self.connection.close()
    
    def callback(self, ch, method, properties, body):
        message = json.loads(body)
        image = self.decode_image(message.get("image", None))
        file_id = message.get("id", "unknown")
        model = message.get("model", "")
        
        if not image:
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return

        results = []

        print(f"Processing model: {model} for file ID: {file_id}")
        if model not in self.loaded_models:
            try:
                self.loaded_models[model] = pipeline("image-to-text", model=model)
                # Add model to cached models if it was loaded successfully and notify the server
                self.cached_models.add(model)
                self.send_status()
            except Exception as e:
                print(f"Error loading model {model}: {e}")
                return
        
        pipe = self.loaded_models[model]
        try:
            result = pipe(image)[0]["generated_text"]
            print(f"Model: {model}, Result: {result}")
            results.append({"model": model, "caption": result})
        except Exception as e:
            print(f"Error processing image with model {model}: {e}")
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


    def decode_image(self, b64_data):
        # Decode base64 image data
        try:
            return Image.open(io.BytesIO(base64.b64decode(b64_data)))
        except Exception as e:
            print(f"Error decoding image: {e}")
            return None
    
    def status_sender(self):
        # Continuously send status updates to the server
        while self.sending_status:
            self.send_status(status="online")
            time.sleep(10)

    def scan_cache(self):
        # Scan the cache directory for models and filter for image-to-text models from huggingface
        for repo in scan_cache_dir().repos:
            model = repo.repo_id
            if repo_exists(model) and "image-to-text" in repo_info(model).tags:
                self.cached_models.add(model)
    
    def send_status(self, status="online"):
        # Send the worker's status to the server
        params = pika.URLParameters(self.rabbitmq_url)
        conn = pika.BlockingConnection(params)
        ch = conn.channel()

        msg = {
            "worker_id": self.worker_id,
            "available_models": list(self.cached_models),
            "status": status
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