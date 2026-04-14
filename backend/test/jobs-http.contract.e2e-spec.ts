import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Job, JobStatus } from '../src/jobs/entities/job.entity';
import { TranscriptionRmqPublisher } from '../src/jobs/transcription-rmq.publisher';

describe('Jobs HTTP contract (e2e)', () => {
  let app: INestApplication;
  let jobsRepository: Repository<Job>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TranscriptionRmqPublisher)
      .useValue({
        publishJobQueued: jest.fn().mockResolvedValue(undefined),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    jobsRepository = app.get<Repository<Job>>(getRepositoryToken(Job));
  });

  beforeEach(async () => {
    await jobsRepository.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('PATCH /jobs/:id contract used by worker', async () => {
    const loginResponse = await request(app.getHttpServer())
      .get('/auth/login/worker-test-user')
      .expect(200);
    const token = loginResponse.body.access_token as string;

    const createResponse = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'contract target' })
      .expect(201);
    const createdId = createResponse.body.id as string;

    const payload = {
      status: JobStatus.DONE,
      resultText: 'Transcribed text',
      summary: 'Short summary',
    };

    const response = await request(app.getHttpServer())
      .patch(`/jobs/${createdId}`)
      .send(payload)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: createdId,
        title: 'contract target',
        userId: 'worker-test-user',
        status: JobStatus.DONE,
        resultText: 'Transcribed text',
        summary: 'Short summary',
      }),
    );
  });

  it('PATCH /jobs/:id rejects invalid status enum values', async () => {
    const created = await jobsRepository.save({
      title: 'enum check',
      userId: 'worker-test-user',
      status: JobStatus.PROCESSING,
      resultText: null,
      summary: null,
    });

    await request(app.getHttpServer())
      .patch(`/jobs/${created.id}`)
      .send({
        status: 'FINISHED',
      })
      .expect(400);
  });

  it('PATCH /jobs/:id returns 404 for missing jobs', async () => {
    await request(app.getHttpServer())
      .patch('/jobs/7cb39e8a-77bb-4214-a843-5e3fdb4c8953')
      .send({ status: JobStatus.ERROR })
      .expect(404);
  });
});
