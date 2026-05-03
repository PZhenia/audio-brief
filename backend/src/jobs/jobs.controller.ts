import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { CreateJobDto } from './dto/create-job.dto';
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

  @Get(':id/result')
  @UseGuards(JwtAuthGuard)
  getResult(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('inline') inline?: string,
  ) {
    const inlineText = inline === 'true' || inline === '1';
    return this.jobsService.getResultForUser(userId, id, inlineText);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.removeForUser(userId, id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@UserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.jobsService.findOneForUser(userId, id);
  }
}
