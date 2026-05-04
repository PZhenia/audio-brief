import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { CreateJobFormDto } from './dto/create-job.dto';
import { JobsService } from './jobs.service';

const upload = memoryStorage();
const maxAudioBytes = 200 * 1024 * 1024;

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: upload,
      limits: { fileSize: maxAudioBytes },
    }),
  )
  create(
    @UserId() userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: CreateJobFormDto,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Audio file is required (field name: file).');
    }
    return this.jobsService.create(userId, file, body.title);
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
