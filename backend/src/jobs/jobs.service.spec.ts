import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventsGateway } from '../events/events.gateway';
import { Job, JobStatus } from './entities/job.entity';
import { JobsService } from './jobs.service';
import { MinioStorageService } from './minio-storage.service';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

describe('JobsService', () => {
  let service: JobsService;
  let repository: jest.Mocked<
    Pick<Repository<Job>, 'create' | 'save' | 'find' | 'findOne'>
  >;
  let publisher: jest.Mocked<
    Pick<TranscriptionRmqPublisher, 'publishJobQueued'>
  >;
  let minio: jest.Mocked<
    Pick<MinioStorageService, 'getPresignedGetUrl' | 'getObjectText'>
  >;
  let events: jest.Mocked<Pick<EventsGateway, 'emitStatusUpdate'>>;

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
    minio = {
      getPresignedGetUrl: jest
        .fn()
        .mockResolvedValue('https://minio/presigned'),
      getObjectText: jest.fn().mockResolvedValue('text'),
    };
    events = {
      emitStatusUpdate: jest.fn(),
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
        {
          provide: MinioStorageService,
          useValue: minio,
        },
        {
          provide: EventsGateway,
          useValue: events,
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
      s3Key: null,
      summary: null,
    };
    const queued: Job = { ...created, status: JobStatus.QUEUED };
    repository.create.mockReturnValue(created);
    repository.save
      .mockResolvedValueOnce(created)
      .mockResolvedValueOnce(queued);

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
      s3Key: null,
      summary: null,
    };
    repository.create.mockReturnValue(created);
    repository.save.mockResolvedValue(created);
    publisher.publishJobQueued.mockRejectedValue(new Error('rmq down'));

    await expect(
      service.create('user-1', { title: 'Queue fail' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('returns all jobs for user', async () => {
    const jobs: Job[] = [
      {
        id: 'job-1',
        title: 'A',
        userId: 'user-1',
        status: JobStatus.DONE,
        s3Key: null,
        summary: 'sum',
      },
    ];
    repository.find.mockResolvedValue(jobs);

    const result = await service.findAllForUser('user-1');

    expect(repository.find).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
    expect(result).toEqual(jobs);
  });

  it('returns one job for user', async () => {
    const job: Job = {
      id: 'job-1',
      title: 'A',
      userId: 'user-1',
      status: JobStatus.PROCESSING,
      s3Key: null,
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
    await expect(
      service.findOneForUser('user-1', 'missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('applyTranscriptionResultFromQueue saves and emits status_update', async () => {
    const existing: Job = {
      id: 'job-1',
      title: 'A',
      userId: 'user-1',
      status: JobStatus.PROCESSING,
      s3Key: null,
      summary: null,
    };
    repository.findOne.mockResolvedValue(existing);
    repository.save.mockImplementation((j: Job) => Promise.resolve(j));

    await service.applyTranscriptionResultFromQueue({
      jobId: 'job-1',
      s3Key: 'job-1.txt',
    });

    expect(existing.status).toBe(JobStatus.DONE);
    expect(existing.s3Key).toBe('job-1.txt');
    expect(events.emitStatusUpdate).toHaveBeenCalledWith('user-1', {
      jobId: 'job-1',
      status: JobStatus.DONE,
      s3Key: 'job-1.txt',
    });
  });

  it('applyTranscriptionResultFromQueue ignores duplicate terminal state events', async () => {
    const existing: Job = {
      id: 'job-dup',
      title: 'A',
      userId: 'user-1',
      status: JobStatus.DONE,
      s3Key: 'job-dup.txt',
      summary: null,
    };
    repository.findOne.mockResolvedValue(existing);

    await service.applyTranscriptionResultFromQueue({
      jobId: 'job-dup',
      status: 'DONE',
      s3Key: 'new-key.txt',
    });

    expect(repository.save).not.toHaveBeenCalled();
    expect(events.emitStatusUpdate).not.toHaveBeenCalled();
  });
});
