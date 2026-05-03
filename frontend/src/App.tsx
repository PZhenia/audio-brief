import { Copy, Loader2, Mic, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { Layout } from './components/Layout'
import { Badge } from './components/ui/Badge'
import { Button } from './components/ui/Button'
import { Card } from './components/ui/Card'
import { createJob, deleteJob, fetchJobs, fetchResultWithText, loginByUserId } from './lib/api'
import type { Job, JobStatus, StatusUpdatePayload } from './types/job'

type UiJob = Job & {
  createdAtLocal: string | null
  progress?: number
}

type BadgeTone = 'pending' | 'processing' | 'done' | 'error' | 'neutral'

const TOKEN_KEY = 'audio-brief-token'
const USER_KEY = 'audio-brief-user'
const THEME_KEY = 'audio-brief-theme'

function displayStatus(status: JobStatus): string {
  if (status === 'CREATED' || status === 'QUEUED') return 'PENDING'
  return status
}

function toneFromStatus(status: JobStatus): BadgeTone {
  if (status === 'CREATED' || status === 'QUEUED') return 'pending'
  if (status === 'PROCESSING') return 'processing'
  if (status === 'DONE') return 'done'
  if (status === 'ERROR') return 'error'
  return 'neutral'
}

function formatLocalTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function jobSortTimestamp(job: UiJob): number {
  const raw = job.createdAt ?? job.createdAtLocal
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isNaN(t) ? 0 : t
}

function mergeJobs(previous: UiJob[], incoming: Job[]) {
  const prevMap = new Map(previous.map((item) => [item.id, item]))
  return incoming.map((job) => {
    const prev = prevMap.get(job.id)
    return {
      ...job,
      createdAtLocal: prev?.createdAtLocal ?? null,
      progress: prev?.progress,
    }
  })
}

type ResultModalState =
  | { open: false }
  | { open: true; jobId: string; title: string; text: string | null; loading: boolean; error: string | null }

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null) ?? 'light',
  )
  const [userId, setUserId] = useState(localStorage.getItem(USER_KEY) ?? '')
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) ?? '')
  const [loginValue, setLoginValue] = useState(userId || 'user-1')
  const [titleValue, setTitleValue] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [jobs, setJobs] = useState<UiJob[]>([])
  const [wsConnected, setWsConnected] = useState(false)
  const [creating, setCreating] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [resultModal, setResultModal] = useState<ResultModalState>({ open: false })
  const [copyDone, setCopyDone] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fileReady = Boolean(selectedFileName && titleValue.trim())

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])

  useEffect(() => {
    if (!token) {
      return
    }
    fetchJobs(token)
      .then((data) => {
        setJobs((prev) => mergeJobs(prev, data))
      })
      .catch(() => setError('Failed to load jobs.'))
  }, [token])

  useEffect(() => {
    if (!token) return
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token },
      query: { token },
    })

    socket.on('connect', () => setWsConnected(true))
    socket.on('disconnect', () => setWsConnected(false))
    socket.on('status_update', (payload: StatusUpdatePayload) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === payload.jobId
            ? {
                ...job,
                status: payload.status,
                s3Key: payload.s3Key ?? job.s3Key,
                progress: payload.progress ?? job.progress,
              }
            : job,
        ),
      )
    })

    return () => {
      socket.disconnect()
      setWsConnected(false)
    }
  }, [token])

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => jobSortTimestamp(b) - jobSortTimestamp(a)),
    [jobs],
  )

  const handleLogin = async () => {
    if (!loginValue.trim()) return
    setAuthLoading(true)
    setError(null)
    try {
      const jwt = await loginByUserId(loginValue.trim())
      localStorage.setItem(TOKEN_KEY, jwt)
      localStorage.setItem(USER_KEY, loginValue.trim())
      window.location.reload()
    } catch {
      setError('Could not obtain JWT. Check that the backend is running.')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken('')
    setUserId('')
    setJobs([])
    setLoginValue('')
    setResultModal({ open: false })
  }

  const handleCreateJob = async () => {
    if (!token || !titleValue.trim()) return
    setCreating(true)
    setError(null)
    try {
      const created = await createJob(token, titleValue.trim())
      setJobs((prev) => [
        {
          ...created,
          createdAtLocal: new Date().toISOString(),
        },
        ...prev,
      ])
      setTitleValue('')
      setSelectedFileName('')
    } catch {
      setError('Could not create transcription job.')
    } finally {
      setCreating(false)
    }
  }

  const openResult = useCallback(
    async (jobId: string, title: string) => {
      if (!token) return
      setResultModal({ open: true, jobId, title, text: null, loading: true, error: null })
      setCopyDone(false)
      try {
        const data = await fetchResultWithText(token, jobId)
        setResultModal({
          open: true,
          jobId,
          title,
          text: data.text ?? '(No text in response — open the file from storage.)',
          loading: false,
          error: null,
        })
      } catch {
        setResultModal({
          open: true,
          jobId,
          title,
          text: null,
          loading: false,
          error: 'Could not load transcription.',
        })
      }
    },
    [token],
  )

  const closeResult = useCallback(() => {
    setResultModal({ open: false })
    setCopyDone(false)
  }, [])

  const handleDeleteJob = async (job: UiJob) => {
    if (!token) return
    if (!confirm(`Remove "${job.title}" from recent tasks?`)) return
    setDeletingId(job.id)
    setError(null)
    try {
      await deleteJob(token, job.id)
      setJobs((prev) => prev.filter((j) => j.id !== job.id))
      if (resultModal.open && resultModal.jobId === job.id) {
        closeResult()
      }
    } catch {
      setError('Could not delete job.')
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (!resultModal.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeResult()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resultModal.open, closeResult])

  const handleCopyResult = async () => {
    if (resultModal.open !== true || !resultModal.text) return
    try {
      await navigator.clipboard.writeText(resultModal.text)
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2000)
    } catch {
      setError('Clipboard copy failed.')
    }
  }

  const attachFile = (file: File | null) => {
    if (!file) return
    setSelectedFileName(file.name)
    setTitleValue(file.name)
  }

  const handleFilePicked = (file: File | null) => {
    attachFile(file)
  }

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) attachFile(f)
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] px-4 dark:bg-[#111827]">
        <Card className="w-full max-w-md p-8">
          <h2 className="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">Sign In</h2>
          <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
            Enter your User ID to receive a JWT
          </p>
          <label htmlFor="user-id" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
            User ID
          </label>
          <input
            id="user-id"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            placeholder="user-id"
            className="mb-6 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none ring-indigo-500/40 focus:ring-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <Button onClick={handleLogin} className="w-full" disabled={authLoading}>
            {authLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Please wait…
              </>
            ) : (
              'Get Access'
            )}
          </Button>
          {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </Card>
      </div>
    )
  }

  return (
    <Layout
      isDark={theme === 'dark'}
      onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      wsConnected={wsConnected}
      userId={userId}
      onLogout={handleLogout}
    >
      <div>
        <h2 className="mb-6 text-[32px] font-semibold leading-tight tracking-tight text-gray-900 dark:text-white">
          Transcription
        </h2>

        <section className="mb-12">
          <div
            className={`rounded-2xl border-2 border-dashed p-12 text-center transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50/80 dark:border-violet-500 dark:bg-violet-950/30'
                : 'border-gray-300 bg-gray-50/50 dark:border-gray-600 dark:bg-gray-800/30'
            }`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            <label htmlFor="audio-file" className="block cursor-pointer">
              <input
                id="audio-file"
                type="file"
                className="sr-only"
                accept="audio/*"
                onChange={(e) => handleFilePicked(e.target.files?.[0] ?? null)}
              />
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-gray-200 bg-white text-indigo-600 shadow-sm dark:border-gray-600 dark:bg-[#1F2937] dark:text-violet-400">
                <Mic className="h-8 w-8" strokeWidth={1.75} />
              </div>
              <p className="mb-2 text-2xl font-semibold text-gray-900 dark:text-white">Select Audio File</p>
              <p className="mb-8 text-base text-gray-500 dark:text-gray-400">
                Drag and drop or click to browse
              </p>

              {selectedFileName ? (
                <div className="mx-auto mb-8 max-w-md rounded-lg border border-gray-200 bg-white px-4 py-3 text-left dark:border-gray-600 dark:bg-[#1F2937]">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {selectedFileName}
                  </p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    {creating ? (
                      <div className="relative h-full w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div className="ab-progress-strip absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 dark:from-violet-500 dark:to-indigo-400" />
                      </div>
                    ) : (
                      <div className="h-full w-full rounded-full bg-indigo-500 transition-all dark:bg-violet-500" />
                    )}
                  </div>
                </div>
              ) : null}
            </label>

            <Button
              type="button"
              onClick={handleCreateJob}
              disabled={creating || !fileReady}
              className={`min-w-[240px] ${!fileReady ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                'Create Transcription Job'
              )}
            </Button>
          </div>
        </section>

        <section>
          <h3 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-white">Recent Tasks</h3>
          <div className="flex flex-col gap-4">
            {sortedJobs.length === 0 ? (
              <Card className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No jobs yet. Attach an audio file and create a job.
              </Card>
            ) : (
              sortedJobs.map((job) => (
                <Card key={job.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-nowrap">
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <p className="truncate font-medium text-gray-900 dark:text-gray-100">{job.title}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {formatLocalTime(job.createdAt ?? job.createdAtLocal ?? null)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center justify-center">
                      <Badge tone={toneFromStatus(job.status)}>
                        {job.status === 'PROCESSING' ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                        ) : null}
                        {displayStatus(job.status)}
                      </Badge>
                    </div>

                    <div className="flex h-11 shrink-0 items-center justify-end gap-2 sm:min-w-[240px]">
                      {job.status === 'DONE' ? (
                        <Button variant="secondary" onClick={() => openResult(job.id, job.title)}>
                          View Result
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => void handleDeleteJob(job)}
                        disabled={deletingId === job.id || job.status === 'PROCESSING'}
                        aria-label={`Delete ${job.title}`}
                        className="h-11 w-11 shrink-0 p-0 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      >
                        {deletingId === job.id ? (
                          <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-7 w-7" strokeWidth={2} aria-hidden />
                        )}
                      </Button>
                    </div>
                  </div>

                  {job.status === 'PROCESSING' ? (
                    <div className="mt-4">
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-500 dark:bg-blue-400"
                          style={{ width: `${job.progress ?? 40}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                </Card>
              ))
            )}
          </div>
        </section>

        {error ? <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </div>

      {resultModal.open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
          onClick={closeResult}
        >
          <div
            className="relative w-full max-w-[800px] rounded-2xl border border-gray-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-[#1F2937]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="result-title" className="text-2xl font-semibold text-gray-900 dark:text-white">
                Transcription Result
              </h2>
              <button
                type="button"
                onClick={closeResult}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 truncate text-sm text-gray-500 dark:text-gray-400">{resultModal.title}</p>

            <div className="relative rounded-xl bg-white p-6 dark:bg-gray-800/80">
              {resultModal.loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  Loading…
                </div>
              ) : resultModal.error ? (
                <p className="text-sm text-red-600 dark:text-red-400">{resultModal.error}</p>
              ) : (
                <>
                  <div className="mb-3 flex justify-start">
                    <Button
                      variant="secondary"
                      onClick={handleCopyResult}
                      className="text-xs sm:text-sm"
                      disabled={!resultModal.text}
                    >
                      <Copy className="h-4 w-4" />
                      {copyDone ? 'Copied' : 'Copy to Clipboard'}
                    </Button>
                  </div>
                  <pre className="max-h-[min(60vh,480px)] overflow-auto whitespace-pre-wrap font-sans text-base leading-[1.6] text-gray-900 dark:text-gray-100">
                    {resultModal.text}
                  </pre>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Layout>
  )
}

export default App
