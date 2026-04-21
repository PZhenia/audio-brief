import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { JobsService } from './jobs.service';

@Controller()
export class TranscriptionResultsConsumer {
  constructor(private readonly jobsService: JobsService) {}

  @EventPattern('transcription_results')
  async handleCompleted(
    @Payload()
    data: {
      jobId: string;
      status?: string;
      s3Key?: string;
      error?: string;
    },
  ): Promise<void> {
    await this.jobsService.applyTranscriptionResultFromQueue(data);
  }
}
