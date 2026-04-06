import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { TRANSCRIPTION_REQUESTS_QUEUE } from './jobs.constants';

const brokerUrl =
  process.env.RABBITMQ_URL ?? 'amqp://yevheniia:web_2026@localhost:5672';

@Injectable()
export class TranscriptionRmqPublisher implements OnModuleDestroy {
  private connection: amqp.Connection | null = null;
  private channel: amqp.ConfirmChannel | null = null;

  private async getChannel(): Promise<amqp.ConfirmChannel> {
    if (this.channel) {
      return this.channel;
    }
    this.connection = await amqp.connect(brokerUrl);
    this.channel = await this.connection.createConfirmChannel();
    await this.channel.assertQueue(TRANSCRIPTION_REQUESTS_QUEUE, {
      durable: true,
    });
    return this.channel;
  }

  async publishJobQueued(payload: {
    jobId: string;
    title: string;
    userId: string;
  }): Promise<void> {
    const channel = await this.getChannel();
    const body = Buffer.from(
      JSON.stringify({
        pattern: TRANSCRIPTION_REQUESTS_QUEUE,
        data: payload,
      }),
    );
    await new Promise<void>((resolve, reject) => {
      channel.sendToQueue(
        TRANSCRIPTION_REQUESTS_QUEUE,
        body,
        { persistent: true },
        (err) => (err ? reject(err) : resolve()),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.channel?.close();
    } finally {
      this.channel = null;
    }
    try {
      await this.connection?.close();
    } finally {
      this.connection = null;
    }
  }
}
