FROM pytorch/pytorch:2.7.1-cuda12.6-cudnn9-devel

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . worker

CMD ["python", "worker/worker.py"]