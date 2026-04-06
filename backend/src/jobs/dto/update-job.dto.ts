import { IsEnum, IsOptional, IsString } from 'class-validator';
import { JobStatus } from '../entities/job.entity';

export class UpdateJobDto {
  @IsOptional()
  @IsEnum(JobStatus)
  status?: JobStatus;

  @IsOptional()
  @IsString()
  resultText?: string;

  @IsOptional()
  @IsString()
  summary?: string;
}
