import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

describe('JobsController', () => {
  let controller: JobsController;
  let jobsService: {
    create: jest.Mock;
    findAllForUser: jest.Mock;
    findOneForUser: jest.Mock;
  };

  beforeEach(async () => {
    jobsService = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: jobsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<JobsController>(JobsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates create to service with userId and dto', () => {
    const dto = { title: 'Record meeting' };
    controller.create('user-1', dto);
    expect(jobsService.create).toHaveBeenCalledWith('user-1', dto);
  });

  it('delegates findAll to service', () => {
    controller.findAll('user-1');
    expect(jobsService.findAllForUser).toHaveBeenCalledWith('user-1');
  });

  it('delegates findOne to service', () => {
    controller.findOne('user-1', '9b4f10b7-7d4f-4025-a97f-6189fa2a7ee0');
    expect(jobsService.findOneForUser).toHaveBeenCalledWith(
      'user-1',
      '9b4f10b7-7d4f-4025-a97f-6189fa2a7ee0',
    );
  });

});
