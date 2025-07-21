import pika, json
from config import RABBITMQ_URL
from models import connections, channels

def setup_connection():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    
    return connection, channel

def publish_message(exchange, routing_key, message, properties=None):
    if not connections.get("default") or not channels.get("default") or not channels["default"].is_open:
        connections["default"], channels["default"] = setup_connection()
    channels["default"].exchange_declare(exchange=exchange, exchange_type='topic')

    channels["default"].basic_publish(
        exchange=exchange,
        routing_key=routing_key,
        body=json.dumps(message),
        properties=properties
    )