'use client'

import { useState, type ReactNode } from 'react'

// A collapsible right-rail panel: title + optional badge in the header, content below.
export function RailSection({
  title,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string
  badge?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-line bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-mute">{title}</span>
          {badge}
        </span>
        <svg
          className={`h-3.5 w-3.5 text-mute transition-transform ${open ? '' : '-rotate-90'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="border-t border-line px-3 py-3">{children}</div>}
    </div>
  )
}
