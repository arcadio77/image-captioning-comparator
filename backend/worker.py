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
    
    def start(self):
        self.scan_cache()
        threading.Thread(target=self.status_sender, daemon=True).start()
        self.start_consumer()

    def start_consumer(self):
        params = pika.URLParameters(self.rabbitmq_url)
        connection = None

        try:
            connection = pika.BlockingConnection(params)
            channel = connection.channel()

            channel.queue_declare(queue='image_queue')
            channel.basic_consume(queue='image_queue', on_message_callback=self.callback, auto_ack=False)

            channel.start_consuming()
        except KeyboardInterrupt:
            print("Consumer stopped by user.")
        except Exception as e:
            print(f"Error starting consumer: {e}")
        finally:
            if connection and not connection.is_closed:
                self.send_status(status="offline")
                connection.close()
    
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