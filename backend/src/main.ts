import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';
import {
  TRANSCRIPTION_PROGRESS_QUEUE,
  TRANSCRIPTION_RESULTS_QUEUE,
} from './jobs/jobs.constants';

const rabbitUrl =
  process.env.RABBITMQ_URL ?? 'amqp://yevheniia:web_2026@localhost:5672';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: TRANSCRIPTION_RESULTS_QUEUE,
      queueOptions: { durable: true },
    },
  });
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rabbitUrl],
      queue: TRANSCRIPTION_PROGRESS_QUEUE,
      queueOptions: { durable: true },
    },
  });
  await app.startAllMicroservices();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(
    `HTTP + WebSocket (Socket.IO) on port ${port}. WebSocket: same origin; auth JWT via query ?token=, ?access_token=, handshake auth.token, or Authorization: Bearer. Subscribed event: "status_update".`,
    'Bootstrap',
  );
}
bootstrap();
