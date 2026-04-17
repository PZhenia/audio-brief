import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { Job, JobStatus } from './entities/job.entity';
import { MinioStorageService } from './minio-storage.service';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    private readonly transcriptionPublisher: TranscriptionRmqPublisher,
    private readonly minioStorage: MinioStorageService,
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
    });
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
    s3Key: string;
  }): Promise<void> {
    const job = await this.jobsRepository.findOne({
      where: { id: payload.jobId },
    });
    if (!job) {
      return;
    }
    job.s3Key = payload.s3Key;
    job.status = JobStatus.DONE;
    job.resultText = null;
    await this.jobsRepository.save(job);
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

  async update(id: string, dto: UpdateJobDto): Promise<Job> {
    const job = await this.jobsRepository.findOne({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    if (dto.status !== undefined) {
      job.status = dto.status;
    }
    if (dto.resultText !== undefined) {
      job.resultText = dto.resultText;
    }
    if (dto.s3Key !== undefined) {
      job.s3Key = dto.s3Key;
    }
    if (dto.summary !== undefined) {
      job.summary = dto.summary;
    }
    return this.jobsRepository.save(job);
  }
}
