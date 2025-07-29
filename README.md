
# Image Captioning Comparator

A distributed system designed to generate and compare image captions using state-of-the-art Hugging Face models. It supports multiple models simultaneously, worker scaling, and provides a web interface for managing workers and visualizing results.

## Features

#### Core Capabilities
- Image captioning using Hugging Face models
- Support for image-to-text and image-text-to-text models
- Fast and asynchronous processing using aio_pika and asyncio

#### Worker System
- Dynamic model downloading, unloading, and deletion per worker
- Support for custom user-defined models
- Task handling with routing keys per model

#### Backend
- RESTful API to manage workers, models, and image tasks
- Handles file uploads, model lifecycle, and response collection
- Keeps track of available workers and cached/loaded models

#### Frontend
- View and manage available workers
- Upload one or more images
- Select target models
- View generated captions in a clean UI


## Tech Stack

**Client:** Typescript, React

**Server:** Python, FastAPI, aio_pika

**Worker**: Python, aio_pika, transformers, prometheus_client

## Prerequisites
* Docker and Docker Compose installed
* A running RabbitMQ instance - either:
  * Locally, using Docker or a native installation, or
  * In the cloud, accessible to both the backend and all workers

## Installation

You need to run **RabbitMQ**, the **backend + frontend**, and one or more **workers**.

1. #### Start RabbitMQ (required) 
2. #### From the root of your project directory:
```
docker-compose up
```
This will start:
* FastAPI backend at http://localhost:8000
* Frontend (React) at http://localhost:3333

3. #### Start a worker
In a separate terminal:
```
docker-compose -f docker-compose.worker.yml up
```
This command starts both the **worker** service and **Prometheus** monitoring service as defined in the docker-compose.worker.yml file.

You can run multiple worker instances if needed - even on different machines by connecting them to a shared RabbitMQ instance in the cloud.

### Environment Variables
Make sure that the backend service and all workers use the same RabbitMQ URL. Example `.env` file:
```
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
```
You can also customize the backend's response queue name (useful if multiple backends share the same broker):
```
SERVER_QUEUE=example_queue
```

## Adding a Custom Model

To add your own custom image captioning model to the system, you need to implement the following interface:

```python
from abc import ABC, abstractmethod
from PIL import Image

class CustomModel(ABC):
    @abstractmethod
    def load(self) -> None:
        """
        Load the custom model.
        This method should handle any model initialization and loading from disk or remote sources.
        """
        pass

    @abstractmethod
    def infer(self, image: Image) -> str:
        """
        Run inference on the provided image and return a caption as a string.
        
        Args:
            image (PIL.Image): The input image to caption.
        
        Returns:
            str: The generated caption for the image.
        """
        pass

```

#### Integration

* Implement your custom model class by inheriting from `CustomModel`.
* Place your implementation in the `custom_infer` directory.
* Alternatively, you can add and manage your custom models dynamically using the frontend management interface, which allows uploading and configuring models without restarting workers.
* Once loaded, the system will call `load()` to initialize your model and `infer()` to generate captions for input images.
## Monitoring

Each worker exposes Prometheus-compatible metrics on port 8001 at the `/metrics` endpoint. The following key metrics are available:

* `inference_duration_seconds` - Inference duration per model
* `processed_messages_total` - Total number of processed messages per model
* `processing_errors_total` - Total number of processing errors per model
* `worker_cpu_usage_percent` - CPU usage percent of the worker process 
* `worker_ram_usage_percent` - RAM usage percent of the worker process

These metrics can be collected by Prometheus and visualized with Grafana.