import { Test, TestingModule } from '@nestjs/testing';
import { ClientProxy } from '@nestjs/microservices';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from './entities/job.entity';
import { JobsService } from './jobs.service';

describe('JobsService', () => {
  let service: JobsService;
  let repository: jest.Mocked<Pick<Repository<Job>, 'create' | 'save' | 'find' | 'findOne'>>;
  let transcriptionClient: jest.Mocked<Pick<ClientProxy, 'emit'>>;

  beforeEach(async () => {
    repository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    transcriptionClient = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: getRepositoryToken(Job),
          useValue: repository,
        },
        {
          provide: 'TRANSCRIPTION_SERVICE',
          useValue: transcriptionClient,
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
