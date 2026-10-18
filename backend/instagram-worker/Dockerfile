FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 INSTAGRAM_STATE_DIR=/data/instagram
WORKDIR /app
COPY backend/instagram-worker/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/instagram-music.json /app/instagram-music.json
COPY backend/instagram-worker/worker.py /app/instagram-worker/worker.py
CMD ["python", "/app/instagram-worker/worker.py"]
