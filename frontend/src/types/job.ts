export type JobStatus = 'CREATED' | 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR'

export type Job = {
  id: string
  title: string
  userId: string
  s3Key: string | null
  summary: string | null
  status: JobStatus
  createdAt?: string
}

export type StatusUpdatePayload = {
  jobId: string
  status: JobStatus
  progress?: number
  s3Key?: string
}
