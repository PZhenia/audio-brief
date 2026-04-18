import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { EventsGateway } from '../events/events.gateway';

@Controller()
export class TranscriptionProgressConsumer {
  constructor(private readonly eventsGateway: EventsGateway) {}

  @EventPattern('transcription_progress')
  handleProgress(
    @Payload()
    data: {
      userId: string;
      jobId: string;
      status: string;
      progress?: number;
    },
  ): void {
    this.eventsGateway.emitStatusUpdate(data.userId, {
      jobId: data.jobId,
      status: data.status,
      progress: data.progress,
    });
  }
}
