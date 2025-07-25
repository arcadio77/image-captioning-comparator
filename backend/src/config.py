import os
from dotenv import load_dotenv

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2f")
SERVER_QUEUE = os.getenv("SERVER_QUEUE", "response_queue")
WORKER_TIMEOUT = int(os.getenv("WORKER_TIMEOUT", 30))