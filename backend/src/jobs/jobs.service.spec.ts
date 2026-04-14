import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, JobStatus } from './entities/job.entity';
import { JobsService } from './jobs.service';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

describe('JobsService', () => {
  let service: JobsService;
  let repository: jest.Mocked<Pick<Repository<Job>, 'create' | 'save' | 'find' | 'findOne'>>;
  let publisher: jest.Mocked<Pick<TranscriptionRmqPublisher, 'publishJobQueued'>>;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    publisher = {
      publishJobQueued: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getRepositoryToken(Job),
          useValue: repository,
        },
        {
          provide: TranscriptionRmqPublisher,
          useValue: publisher,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates job, publishes event, and returns queued job', async () => {
    const created: Job = {
      id: 'job-1',
      title: 'Test title',
      userId: 'user-1',
      status: JobStatus.CREATED,
      resultText: null,
      summary: null,
    };
    const queued: Job = { ...created, status: JobStatus.QUEUED };
    repository.create.mockReturnValue(created);
    repository.save.mockResolvedValueOnce(created).mockResolvedValueOnce(queued);

    const result = await service.create('user-1', { title: 'Test title' });

    expect(repository.create).toHaveBeenCalledWith({
      title: 'Test title',
      userId: 'user-1',
      status: JobStatus.CREATED,
    });
    expect(publisher.publishJobQueued).toHaveBeenCalledWith({
      jobId: 'job-1',
      title: 'Test title',
      userId: 'user-1',
    });
    expect(result.status).toBe(JobStatus.QUEUED);
  });

  it('throws ServiceUnavailableException when queue publish fails', async () => {
    const created: Job = {
      id: 'job-2',
      title: 'Queue fail',
      userId: 'user-1',
      status: JobStatus.CREATED,
      resultText: null,
      summary: null,
    };
    repository.create.mockReturnValue(created);
    repository.save.mockResolvedValue(created);
    publisher.publishJobQueued.mockRejectedValue(new Error('rmq down'));

    await expect(service.create('user-1', { title: 'Queue fail' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('returns all jobs for user', async () => {
    const jobs: Job[] = [
      {
        id: 'job-1',
        title: 'A',
        userId: 'user-1',
        status: JobStatus.DONE,
        resultText: 'text',
        summary: 'sum',
      },
    ];
    repository.find.mockResolvedValue(jobs);

    const result = await service.findAllForUser('user-1');

    expect(repository.find).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result).toEqual(jobs);
  });

  it('returns one job for user', async () => {
    const job: Job = {
      id: 'job-1',
      title: 'A',
      userId: 'user-1',
      status: JobStatus.PROCESSING,
      resultText: null,
      summary: null,
    };
    repository.findOne.mockResolvedValue(job);

    const result = await service.findOneForUser('user-1', 'job-1');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { id: 'job-1', userId: 'user-1' },
    });
    expect(result).toEqual(job);
  });

  it('throws NotFoundException when user job not found', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.findOneForUser('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates provided fields', async () => {
    const existing: Job = {
      id: 'job-1',
      title: 'A',
      userId: 'user-1',
      status: JobStatus.PROCESSING,
      resultText: null,
      summary: null,
    };
    const updated: Job = {
      ...existing,
      status: JobStatus.DONE,
      resultText: 'hello',
      summary: 'short',
    };
    repository.findOne.mockResolvedValue(existing);
    repository.save.mockResolvedValue(updated);

    const result = await service.update('job-1', {
      status: JobStatus.DONE,
      resultText: 'hello',
      summary: 'short',
    });

    expect(result).toEqual(updated);
    expect(repository.save).toHaveBeenCalledWith(updated);
  });

  it('throws NotFoundException when update target missing', async () => {
    repository.findOne.mockResolvedValue(null);
    await expect(service.update('missing', { status: JobStatus.ERROR })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
