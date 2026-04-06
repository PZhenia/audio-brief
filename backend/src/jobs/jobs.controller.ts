import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@UserId() userId: string, @Body() createJobDto: CreateJobDto) {
    return this.jobsService.create(userId, createJobDto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@UserId() userId: string) {
    return this.jobsService.findAllForUser(userId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobsService.findOneForUser(userId, id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateJobDto: UpdateJobDto,
  ) {
    return this.jobsService.update(id, updateJobDto);
  }
}
