import type { HTMLAttributes, PropsWithChildren } from 'react'

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-sm dark:border-gray-700 dark:bg-[#1F2937] dark:text-gray-100 dark:shadow-none ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
