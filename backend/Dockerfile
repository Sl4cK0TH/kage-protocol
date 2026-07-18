FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY app /app/app
COPY scripts /app/scripts

# Create data directory for SQLite
RUN mkdir -p /app/data

# Run as non-root user for security
RUN adduser --disabled-password --no-create-home --gecos "" appuser \
    && chown -R appuser:appuser /app/data
USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
