import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './entities/job.entity';
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
});
