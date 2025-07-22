import pika, json, time

import pika.exceptions
from config import RABBITMQ_URL, RETRY_LIMIT
from models import connections, channels

def setup_connection():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()
    
    return connection, channel

def create_connection(name="default"):
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    
    connections[name] = connection

def publish_message(exchange, routing_key, message, properties=None):

    for i in range(RETRY_LIMIT):
        try:
            if not connections.get("default") or connections["default"].is_closed:
                create_connection()
            
            if not channels.get("default") or channels["default"].is_closed:
                channels["default"] = connections["default"].channel()

            channels["default"].exchange_declare(exchange=exchange, exchange_type='topic')

            channels["default"].basic_publish(
                exchange=exchange,
                routing_key=routing_key,
                body=json.dumps(message),
                properties=properties
            )
            break

        except (pika.exceptions.AMQPConnectionError,
                pika.exceptions.ChannelClosed,
                pika.exceptions.ConnectionClosed,
                pika.exceptions.StreamLostError) as e:
            print(f"Connection error: {e}. Retrying ({i+1}/{RETRY_LIMIT})...")
            time.sleep(1)
    
    else:
        print("Failed to publish message after {RETRY_LIMIT} attempts.")