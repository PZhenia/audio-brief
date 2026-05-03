import { LogOut, Moon, Sun, Wifi } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { Badge } from './ui/Badge'
import { Button } from './ui/Button'

type LayoutProps = PropsWithChildren<{
  isDark: boolean
  onToggleTheme: () => void
  wsConnected: boolean
  userId: string
  onLogout: () => void
}>

export function Layout({
  children,
  isDark,
  onToggleTheme,
  wsConnected,
  userId,
  onLogout,
}: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#F9FAFB] text-gray-900 dark:bg-[#111827] dark:text-gray-100">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-md dark:border-gray-700 dark:bg-[#1F2937]/90">
        <div className="mx-auto flex h-16 w-full max-w-[800px] items-center justify-between px-4 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white">
            AudioBrief
          </h1>

          <div className="flex items-center gap-2">
            <div className="mr-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 dark:border-gray-600 dark:bg-gray-800/80">
              <span className="relative inline-flex h-2 w-2">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full ${wsConnected ? 'animate-ping bg-emerald-400/70' : 'bg-rose-500/50'}`}
                />
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}
                />
              </span>
              <Wifi className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </div>
            <Badge tone="neutral" className="hidden max-w-[140px] truncate sm:inline-flex">
              {userId}
            </Badge>
            <Button
              variant="ghost"
              onClick={onToggleTheme}
              aria-label="Toggle theme"
              className="h-11 w-11 rounded-lg p-0"
            >
              {isDark ? <Sun className="h-7 w-7" strokeWidth={2} /> : <Moon className="h-7 w-7" strokeWidth={2} />}
            </Button>
            <Button
              variant="ghost"
              onClick={onLogout}
              aria-label="Logout"
              className="h-11 w-11 rounded-lg p-0 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut className="h-7 w-7" strokeWidth={2} />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[800px] px-4 pb-12 pt-24 sm:px-6">{children}</main>
    </div>
  )
}
