import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { Job, JobStatus } from './entities/job.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
    @Inject('TRANSCRIPTION_SERVICE')
    private readonly transcriptionClient: ClientProxy,
  ) {}

  async create(userId: string, createJobDto: CreateJobDto): Promise<Job> {
    const createdJob = this.jobsRepository.create({
      title: createJobDto.title,
      userId,
      status: JobStatus.CREATED,
    });
    const savedJob = await this.jobsRepository.save(createdJob);

    try {
      await firstValueFrom(
        this.transcriptionClient.emit('transcription.requested', {
          jobId: savedJob.id,
          title: savedJob.title,
          userId: savedJob.userId,
        }),
      );
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
}
