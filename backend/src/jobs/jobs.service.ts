import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { Job, JobStatus } from './entities/job.entity';
import { EventsGateway } from '../events/events.gateway';
import { MinioStorageService } from './minio-storage.service';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    private readonly transcriptionPublisher: TranscriptionRmqPublisher,
    private readonly minioStorage: MinioStorageService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, createJobDto: CreateJobDto): Promise<Job> {
    const createdJob = this.jobsRepository.create({
      title: createJobDto.title,
      userId,
      status: JobStatus.CREATED,
    });
    const savedJob = await this.jobsRepository.save(createdJob);

    try {
      await this.transcriptionPublisher.publishJobQueued({
        jobId: savedJob.id,
        title: savedJob.title,
        userId: savedJob.userId,
      });
    } catch {
      throw new ServiceUnavailableException(
        'Job created, but queue is unavailable. Please retry later.',
      );
    }

    savedJob.status = JobStatus.QUEUED;
    return this.jobsRepository.save(savedJob);
  }

  async findAllForUser(userId: string): Promise<Job[]> {
    return this.jobsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async removeForUser(userId: string, id: string): Promise<void> {
    const job = await this.jobsRepository.findOne({
      where: { id, userId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (job.s3Key) {
      try {
        await this.minioStorage.deleteObject(job.s3Key);
      } catch (err) {
        this.logger.warn(
          `Could not delete MinIO object ${job.s3Key} for job ${job.id}: ${String(err)}`,
        );
      }
    }
    await this.jobsRepository.delete({ id: job.id, userId });
  }

  async findOneForUser(userId: string, id: string): Promise<Job> {
    const job = await this.jobsRepository.findOne({
      where: { id, userId },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  /**
   * Called by RMQ consumer when the worker uploaded the transcript to MinIO.
   */
  async applyTranscriptionResultFromQueue(payload: {
    jobId: string;
    status?: string;
    s3Key?: string;
    error?: string;
  }): Promise<void> {
    const job = await this.jobsRepository.findOne({
      where: { id: payload.jobId },
    });
    if (!job) {
      return;
    }
    if (job.status === JobStatus.DONE || job.status === JobStatus.ERROR) {
      this.logger.warn(
        `Duplicate transcription result ignored for job ${job.id}; current status=${job.status}.`,
      );
      return;
    }
    const normalizedStatus =
      payload.status?.toUpperCase() === JobStatus.ERROR
        ? JobStatus.ERROR
        : JobStatus.DONE;
    job.status = normalizedStatus;
    if (normalizedStatus === JobStatus.DONE && payload.s3Key) {
      job.s3Key = payload.s3Key;
    }
    if (normalizedStatus === JobStatus.ERROR && payload.error) {
      job.summary = payload.error.slice(0, 500);
    }
    await this.jobsRepository.save(job);
    this.eventsGateway.emitStatusUpdate(job.userId, {
      jobId: job.id,
      status: job.status,
      s3Key: job.s3Key,
    });
  }

  async applyTranscriptionProgressFromQueue(payload: {
    jobId: string;
    status: string;
    progress?: number;
    userId?: string;
  }): Promise<void> {
    const job = await this.jobsRepository.findOne({
      where: { id: payload.jobId },
    });
    if (!job) {
      return;
    }
    const normalizedStatus = payload.status.toUpperCase();
    if (normalizedStatus === 'PROCESSING') {
      job.status = JobStatus.PROCESSING;
      await this.jobsRepository.save(job);
    } else if (normalizedStatus === 'ERROR') {
      job.status = JobStatus.ERROR;
      await this.jobsRepository.save(job);
    }
    this.eventsGateway.emitStatusUpdate(payload.userId ?? job.userId, {
      jobId: job.id,
      status: job.status,
      progress: payload.progress,
    });
  }

  async getResultForUser(
    userId: string,
    id: string,
    inlineText: boolean,
  ): Promise<{
    presignedUrl: string;
    expiresInSeconds: number;
    text?: string;
  }> {
    const job = await this.findOneForUser(userId, id);
    if (job.status !== JobStatus.DONE) {
      throw new BadRequestException('Transcription is not finished yet.');
    }
    if (!job.s3Key) {
      throw new BadRequestException(
        'No transcription object is registered for this job.',
      );
    }
    const expiresInSeconds = 3600;
    const presignedUrl = await this.minioStorage.getPresignedGetUrl(
      job.s3Key,
      expiresInSeconds,
    );
    if (inlineText) {
      const text = await this.minioStorage.getObjectText(job.s3Key);
      return { presignedUrl, expiresInSeconds, text };
    }
    return { presignedUrl, expiresInSeconds };
  }
}
