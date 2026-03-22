import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { CreateJobDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  create(@UserId() userId: string, @Body() createJobDto: CreateJobDto) {
    return this.jobsService.create(userId, createJobDto);
  }

  @Get()
  findAll(@UserId() userId: string) {
    return this.jobsService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.findOneForUser(userId, id);
  }
}
