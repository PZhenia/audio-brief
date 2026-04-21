import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { JobsService } from './jobs.service';

@Controller()
export class TranscriptionProgressConsumer {
  constructor(private readonly jobsService: JobsService) {}

  @EventPattern('transcription_progress')
  async handleProgress(
    @Payload()
    data: {
      userId?: string;
      jobId: string;
      status: string;
      progress?: number;
    },
  ): Promise<void> {
    await this.jobsService.applyTranscriptionProgressFromQueue(data);
  }
}
