import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Job } from '../src/jobs/entities/job.entity';
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

  it('rejects PATCH /jobs/:id because update endpoint is removed', async () => {
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

    await request(app.getHttpServer())
      .patch(`/jobs/${createdId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DONE' })
      .expect(404);
  });

  it('PATCH /jobs/:id returns 404 for existing jobs', async () => {
    const created = await jobsRepository.save({
      title: 'enum check',
      userId: 'worker-test-user',
      status: 'PROCESSING' as Job['status'],
      summary: null,
    });
    const loginResponse = await request(app.getHttpServer())
      .get('/auth/login/worker-test-user')
      .expect(200);
    const token = loginResponse.body.access_token as string;

    await request(app.getHttpServer())
      .patch(`/jobs/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'FINISHED' })
      .expect(404);
  });

  it('PATCH /jobs/:id returns 404 for missing jobs', async () => {
    const loginResponse = await request(app.getHttpServer())
      .get('/auth/login/worker-test-user')
      .expect(200);
    const token = loginResponse.body.access_token as string;

    await request(app.getHttpServer())
      .patch('/jobs/7cb39e8a-77bb-4214-a843-5e3fdb4c8953')
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'ERROR' })
      .expect(404);
  });
});
