import pika, json
from config import RABBITMQ_URL

def setup_connection():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    
    return connection, channel

def publish_message(exchange, routing_key, message, properties=None):
    connection, channel = setup_connection()
    channel.exchange_declare(exchange=exchange, exchange_type='topic')

    channel.basic_publish(
        exchange=exchange,
        routing_key=routing_key,
        body=json.dumps(message),
        properties=properties
    )

    connection.close()