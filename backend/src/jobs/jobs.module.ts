import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Job } from './entities/job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { MinioStorageService } from './minio-storage.service';
import { TranscriptionResultsConsumer } from './transcription-results.consumer';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), AuthModule],
  controllers: [JobsController, TranscriptionResultsConsumer],
  providers: [JobsService, TranscriptionRmqPublisher, MinioStorageService],
})
export class JobsModule {}
