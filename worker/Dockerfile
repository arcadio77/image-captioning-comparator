FROM python:3.13.5-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . worker

CMD ["python", "worker/worker.py"]