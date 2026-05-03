import json
import logging
import os
import subprocess
from pathlib import Path

import boto3
import pika
import whisper
from botocore.exceptions import ClientError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RABBITMQ_HOST = os.environ.get("RABBITMQ_HOST", "localhost")
RABBITMQ_USER = os.environ.get("RABBITMQ_USER", "yevheniia")
RABBITMQ_PASS = os.environ.get("RABBITMQ_PASS", "web_2026")
QUEUE_NAME = os.environ.get("RABBITMQ_QUEUE", "transcription_requests")
RESULTS_QUEUE = os.environ.get("RABBITMQ_RESULTS_QUEUE", "transcription_results")
PROGRESS_QUEUE = os.environ.get("RABBITMQ_PROGRESS_QUEUE", "transcription_progress")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "http://localhost:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "yevheniia")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "web_2026")
S3_BUCKET = os.environ.get("MINIO_BUCKET", "transcriptions")


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


def resolve_audio_path(filename: str | None = None) -> Path | None:
    if filename:
        candidate = Path(__file__).resolve().parent / filename
        if candidate.is_file():
            logger.info("Using queued audio file: %s", candidate)
            return candidate

    env_path = os.environ.get("TRANSCRIBE_AUDIO_PATH")
    if env_path:
        p = Path(env_path)
        if p.is_file():
            logger.info("Using TRANSCRIBE_AUDIO_PATH audio file: %s", p)
            return p

    stub = Path(__file__).resolve().parent / "stub.mp3"
    if stub.is_file():
        logger.info("Using fallback stub audio file: %s", stub)
        return stub
    return None


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        region_name=os.environ.get("MINIO_REGION", "us-east-1"),
    )


def ensure_bucket(client) -> None:
    try:
        client.head_bucket(Bucket=S3_BUCKET)
    except ClientError:
        logger.info("Creating bucket %r", S3_BUCKET)
        client.create_bucket(Bucket=S3_BUCKET)


def upload_transcript_text(client, job_id: str, text: str) -> str:
    s3_key = f"{job_id}.txt"
    body = text.encode("utf-8")
    client.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=body,
        ContentType="text/plain; charset=utf-8",
    )
    return s3_key


def publish_progress(
    ch,
    user_id: str | None,
    job_id: str,
    progress: int,
    status: str = "PROCESSING",
) -> None:
    envelope = {
        "pattern": PROGRESS_QUEUE,
        "data": {
            "jobId": job_id,
            "status": status,
            "progress": progress,
        },
    }
    if user_id:
        envelope["data"]["userId"] = user_id
    body = json.dumps(envelope).encode("utf-8")
    ch.queue_declare(queue=PROGRESS_QUEUE, durable=True)
    ch.basic_publish(
        exchange="",
        routing_key=PROGRESS_QUEUE,
        body=body,
        properties=pika.BasicProperties(
            content_type="application/json",
            delivery_mode=2,
        ),
    )


def publish_transcription_result(ch, job_id: str, s3_key: str) -> None:
    envelope = {
        "pattern": RESULTS_QUEUE,
        "data": {"jobId": job_id, "status": "DONE", "s3Key": s3_key},
    }
    body = json.dumps(envelope).encode("utf-8")
    ch.queue_declare(queue=RESULTS_QUEUE, durable=True)
    ch.basic_publish(
        exchange="",
        routing_key=RESULTS_QUEUE,
        body=body,
        properties=pika.BasicProperties(
            content_type="application/json",
            delivery_mode=2,
        ),
    )


def publish_transcription_failure(ch, job_id: str, error_message: str) -> None:
    envelope = {
        "pattern": RESULTS_QUEUE,
        "data": {
            "jobId": job_id,
            "status": "ERROR",
            "error": error_message,
        },
    }
    body = json.dumps(envelope).encode("utf-8")
    ch.queue_declare(queue=RESULTS_QUEUE, durable=True)
    ch.basic_publish(
        exchange="",
        routing_key=RESULTS_QUEUE,
        body=body,
        properties=pika.BasicProperties(
            content_type="application/json",
            delivery_mode=2,
        ),
    )


def main() -> None:
    logger.info("Loading Whisper (base) on CUDA…")
    model = whisper.load_model("base", device="cuda")

    s3 = get_s3_client()
    ensure_bucket(s3)

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

            user_id = data.get("userId")
            title = data.get("title")
            publish_progress(ch, user_id, job_id, 0, "PROCESSING")
            logger.info("Published PROCESSING for job %s", job_id)

            try:
                audio = resolve_audio_path(title)
                if audio is not None:
                    ffmpeg_path = os.path.join(os.path.dirname(__file__), "ffmpeg.exe")
                    if os.path.exists(ffmpeg_path):
                        logger.info("Using local ffmpeg at: %s", ffmpeg_path)
                        ffmpeg_dir = os.path.dirname(ffmpeg_path)
                        path_parts = os.environ.get("PATH", "").split(os.pathsep)
                        if ffmpeg_dir not in path_parts:
                            os.environ["PATH"] = os.environ.get("PATH", "") + os.pathsep + ffmpeg_dir

                    try:
                        result = model.transcribe(str(audio))
                    except Exception as transcribe_exc:
                        logger.exception("Whisper transcribe failed for file: %s", audio)
                        ffmpeg_cmd = [ffmpeg_path, "-v", "error", "-i", str(audio), "-f", "null", "-"]
                        if not os.path.exists(ffmpeg_path):
                            ffmpeg_cmd[0] = "ffmpeg"
                        try:
                            probe = subprocess.run(
                                ffmpeg_cmd,
                                capture_output=True,
                                text=True,
                                timeout=30,
                            )
                            logger.error("ffmpeg return code: %s", probe.returncode)
                            if probe.stderr:
                                logger.error("ffmpeg stderr: %s", probe.stderr.strip())
                            if probe.stdout:
                                logger.error("ffmpeg stdout: %s", probe.stdout.strip())
                        except Exception:
                            logger.exception("Failed to capture ffmpeg stderr diagnostics")
                        raise transcribe_exc

                    text = (result.get("text") or "").strip()
                else:
                    text = (
                        "[stub] No audio file: set TRANSCRIBE_AUDIO_PATH to a valid .mp3 "
                        "or add worker/stub.mp3 for local tests."
                    )
            except Exception as exc:
                logger.exception("Transcription failed for job %s", job_id)
                publish_transcription_failure(ch, job_id, str(exc))
                if user_id:
                    publish_progress(ch, user_id, job_id, 100, "ERROR")
                ch.basic_ack(delivery_tag=method.delivery_tag)
                return

            if user_id:
                publish_progress(ch, user_id, job_id, 70, "PROCESSING")
                logger.info("Published progress 70%% for job %s", job_id)

            s3_key = upload_transcript_text(s3, job_id, text)
            logger.info("Uploaded transcript to MinIO s3://%s/%s", S3_BUCKET, s3_key)
            publish_transcription_result(ch, job_id, s3_key)
            if user_id:
                publish_progress(ch, user_id, job_id, 100, "DONE")
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
