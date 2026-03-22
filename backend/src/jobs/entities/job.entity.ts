import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum JobStatus {
  CREATED = 'CREATED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  DONE = 'DONE',
  ERROR = 'ERROR',
}

@Entity('jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  userId: string;

  @Column({ type: 'text', nullable: true })
  resultText: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({
    type: 'text',
    default: JobStatus.CREATED,
  })
  status: JobStatus;
}
