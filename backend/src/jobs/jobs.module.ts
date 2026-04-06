import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Job } from './entities/job.entity';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

@Module({
  imports: [TypeOrmModule.forFeature([Job]), AuthModule],
  controllers: [JobsController],
  providers: [JobsService, TranscriptionRmqPublisher],
})
export class JobsModule {}
