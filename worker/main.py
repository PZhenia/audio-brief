import json
import logging
import os
from pathlib import Path

import pika
import requests
import whisper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RABBITMQ_HOST = os.environ.get("RABBITMQ_HOST", "localhost")
RABBITMQ_USER = os.environ.get("RABBITMQ_USER", "yevheniia")
RABBITMQ_PASS = os.environ.get("RABBITMQ_PASS", "web_2026")
QUEUE_NAME = os.environ.get("RABBITMQ_QUEUE", "transcription_requests")

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:3000").rstrip("/")


def parse_payload(body: bytes) -> dict:
    """NestJS RMQ wraps events as { pattern, data } (same as @EventPattern name)."""
    obj = json.loads(body.decode("utf-8"))
    if isinstance(obj, dict) and "data" in obj:
        pattern = obj.get("pattern")
        if pattern is not None and pattern != QUEUE_NAME:
            logger.warning(
                "Unexpected event pattern %r (expected %r); using data anyway",
                pattern,
                QUEUE_NAME,
            )
        return obj["data"]
    return obj


def patch_job(job_id: str, payload: dict) -> None:
    url = f"{BACKEND_URL}/jobs/{job_id}"
    response = requests.patch(url, json=payload, timeout=60)
    response.raise_for_status()


def resolve_audio_path() -> Path | None:
    env_path = os.environ.get("TRANSCRIBE_AUDIO_PATH")
    if env_path:
        p = Path(env_path)
        return p if p.is_file() else None
    stub = Path(__file__).resolve().parent / "stub.mp3"
    return stub if stub.is_file() else None


def main() -> None:
    logger.info("Loading Whisper (base) on CUDA…")
    model = whisper.load_model("base", device="cuda")

    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        credentials=credentials,
    )
    connection = pika.BlockingConnection(parameters)
    channel = connection.channel()
    channel.queue_declare(queue=QUEUE_NAME, durable=True)
    channel.basic_qos(prefetch_count=1)

    def on_message(ch, method, properties, body): 
        logger.info("Received message from queue (%s bytes)", len(body))
        try:
            data = parse_payload(body)
            job_id = data.get("jobId")
            if not job_id:
                logger.error("Missing jobId in message: %s", body)
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return

            patch_job(job_id, {"status": "PROCESSING"})

            audio = resolve_audio_path()
            if audio is not None:
                result = model.transcribe(str(audio))
                text = (result.get("text") or "").strip()
            else:
                text = (
                    "[stub] No audio file: set TRANSCRIBE_AUDIO_PATH to a valid .mp3 "
                    "or add worker/stub.mp3 for local tests."
                )

            patch_job(job_id, {"status": "DONE", "resultText": text})
            ch.basic_ack(delivery_tag=method.delivery_tag)
        except Exception:
            logger.exception("Job processing failed")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

    channel.basic_consume(
        queue=QUEUE_NAME,
        on_message_callback=on_message,
        auto_ack=False,
    )
    logger.info("Worker listening on queue %r", QUEUE_NAME)
    channel.start_consuming()


if __name__ == "__main__":
    main()
