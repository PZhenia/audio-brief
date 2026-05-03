import axios from 'axios'
import type { Job } from '../types/job'

export const api = axios.create({
  baseURL: '/api',
})

export async function loginByUserId(userId: string) {
  const { data } = await api.get<{ access_token: string }>(
    `/auth/login/${encodeURIComponent(userId)}`,
  )
  return data.access_token
}

export async function fetchJobs(token: string) {
  const { data } = await api.get<Job[]>('/jobs', {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data
}

export async function createJob(token: string, title: string) {
  const { data } = await api.post<Job>(
    '/jobs',
    { title },
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return data
}

export async function fetchResultUrl(token: string, jobId: string) {
  const { data } = await api.get<{ presignedUrl: string }>(`/jobs/${jobId}/result`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return data.presignedUrl
}

export async function fetchResultWithText(token: string, jobId: string) {
  const { data } = await api.get<{
    presignedUrl: string
    expiresInSeconds: number
    text?: string
  }>(`/jobs/${jobId}/result`, {
    params: { inline: 'true' },
    headers: { Authorization: `Bearer ${token}` },
  })
  return data
}

export async function deleteJob(token: string, jobId: string) {
  await api.delete(`/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}
