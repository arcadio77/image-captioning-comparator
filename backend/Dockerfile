FROM python:3.13.5-slim

WORKDIR /app

COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY src server

EXPOSE 8000

CMD ["fastapi", "dev", "server/main.py", "--host", "0.0.0.0", "--port", "8000"]