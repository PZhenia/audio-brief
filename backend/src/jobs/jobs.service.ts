import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateJobDto } from './dto/create-job.dto';
import { Job, JobStatus } from './entities/job.entity';

@Injectable()
export class JobsService {
  constructor(
    @InjectRepository(Job)
    private readonly jobsRepository: Repository<Job>,
  ) {}

  async create(userId: string, createJobDto: CreateJobDto): Promise<Job> {
    const job = this.jobsRepository.create({
      title: createJobDto.title,
      userId,
      status: JobStatus.CREATED,
    });
    return this.jobsRepository.save(job);
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
