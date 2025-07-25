import aio_pika
import json
from logger import logger
from config import RABBITMQ_URL

class RabbitManager:
    def __init__(self):
        self.connection = None
        self.channels = {}
    
    async def get_connection(self):
        if self.connection is None or self.connection.is_closed:
            self.connection = await aio_pika.connect_robust(RABBITMQ_URL)
            logger.info("Connected to RabbitMQ")
        return self.connection
    
    async def get_channel(self, name="default") -> aio_pika.Channel:
        if name not in self.channels or self.channels[name].is_closed:
            connection = await self.get_connection()
            self.channels[name] = await connection.channel()
            logger.info(f"Channel '{name}' created")
        return self.channels[name]
    
    async def publish_message(self, exchange_name, routing_key, message, properties=None):
        channel = await self.get_channel("publisher")
        exchange = await channel.declare_exchange(exchange_name, aio_pika.ExchangeType.TOPIC)

        logger.debug(f"Publishing message to exchange '{exchange_name}' with routing key '{routing_key}'")
        await exchange.publish(
            aio_pika.Message(
                body=json.dumps(message).encode(),
                correlation_id=properties.get("correlation_id", None) if properties else None,
                reply_to=properties.get("reply_to", None) if properties else None,
            ),
            routing_key=routing_key
        )

    async def close(self):
        for channel in self.channels.values():
            await channel.close()
        await self.connection.close()

# Global instance of RabbitManager
rabbitmq = RabbitManager()