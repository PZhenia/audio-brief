import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateJobFormDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  title?: string;
}
