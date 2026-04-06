import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { Job, JobStatus } from './entities/job.entity';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    private readonly transcriptionPublisher: TranscriptionRmqPublisher,
  ) {}

  async create(userId: string, createJobDto: CreateJobDto): Promise<Job> {
    const createdJob = this.jobsRepository.create({
      title: createJobDto.title,
      userId,
      status: JobStatus.CREATED,
    });
    const savedJob = await this.jobsRepository.save(createdJob);

    try {
      console.log('Attempting to send to RabbitMQ...');
      await this.transcriptionPublisher.publishJobQueued({
        jobId: savedJob.id,
        title: savedJob.title,
        userId: savedJob.userId,
      });
      console.log('Message sent successfully!');
    } catch (err) {
      console.error('RabbitMQ emit failed:', err);
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
    if (dto.summary !== undefined) {
      job.summary = dto.summary;
    }
    return this.jobsRepository.save(job);
  }
}
