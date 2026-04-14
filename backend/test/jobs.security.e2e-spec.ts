import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Job, JobStatus } from '../src/jobs/entities/job.entity';
import { TranscriptionRmqPublisher } from '../src/jobs/transcription-rmq.publisher';

describe('Jobs security (e2e)', () => {
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

  const login = async (userId: string): Promise<string> => {
    const response = await request(app.getHttpServer())
      .get(`/auth/login/${userId}`)
      .expect(200);
    return response.body.access_token;
  };

  it('blocks unauthenticated access to jobs list', async () => {
    await request(app.getHttpServer()).get('/jobs').expect(401);
  });

  it('blocks requests with invalid bearer token', async () => {
    await request(app.getHttpServer())
      .get('/jobs')
      .set('Authorization', 'Bearer invalid.token.value')
      .expect(401);
  });

  it('returns only jobs that belong to authenticated user', async () => {
    const user1Token = await login('user-1');
    const user2Token = await login('user-2');

    const createResponse = await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ title: 'Private job' })
      .expect(201);
    const jobId = createResponse.body.id as string;

    await request(app.getHttpServer())
      .get(`/jobs/${jobId}`)
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(404);
  });

  it('rejects payloads with extra fields (whitelist + forbidNonWhitelisted)', async () => {
    const token = await login('user-1');

    await request(app.getHttpServer())
      .post('/jobs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Legit title',
        isAdmin: true,
      })
      .expect(400);
  });

  it('rejects invalid UUID in route params', async () => {
    const token = await login('user-1');
    await request(app.getHttpServer())
      .get('/jobs/not-a-uuid')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('allows owner to read their own job', async () => {
    const token = await login('user-1');
    const created = await jobsRepository.save({
      title: 'owned',
      userId: 'user-1',
      status: JobStatus.CREATED,
      resultText: null,
      summary: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/jobs/${created.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: created.id,
        userId: 'user-1',
        title: 'owned',
      }),
    );
  });
});
