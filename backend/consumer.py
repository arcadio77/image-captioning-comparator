import pika, os, io, json, base64
from PIL import Image
from dotenv import load_dotenv
from transformers import pipeline

load_dotenv()

loaded_models = {}

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
QUEUE_NAME = 'image_queue'

def callback(ch, method, properties, body):
    message = json.loads(body)
    file_id = message.get("id", "unknown")
    models = message.get("models", [])
    img = message.get("image", None)
    image_data = Image.open(io.BytesIO(base64.b64decode(img)))
    results = []

    for model in models:
        if model not in loaded_models:
            loaded_models[model] = pipeline("image-to-text", model=model)
    
        pipe = loaded_models[model]
        result = pipe(image_data)[0]["generated_text"]
        results.append({"model": model, "caption": result})

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

def start_consumer():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = None
    try:
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        channel.queue_declare(queue=QUEUE_NAME)

        channel.basic_qos(prefetch_count=1) 

        channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)

        channel.start_consuming()

    except pika.exceptions.AMQPConnectionError as e:
        print(f"Rabbitmq connection error: {e}")
    except KeyboardInterrupt:
        print("Consumer stopped by user.")
    except Exception as e:
        print(f"error: {e}")
    finally:
        if connection and not connection.is_closed:
            connection.close()
            print("RabbitMQ connection closed.")

if __name__ == '__main__':
    start_consumer()
