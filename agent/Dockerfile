FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY auth.py api_client.py router.py main.py ./
COPY agents/ ./agents/
COPY tools/ ./tools/

ENV PYTHONUNBUFFERED=1

CMD ["python", "main.py"]