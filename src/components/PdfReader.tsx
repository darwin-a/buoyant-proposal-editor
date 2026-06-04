'use client'

import { useState } from 'react'

// Wraps the native browser PDF viewer (iframe) with a branded loading state and
// a graceful fallback, so the reader never just flashes blank while the PDF streams.
export function PdfReader({ src, title }: { src: string; title: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  return (
    <div className="relative min-h-0 w-full flex-1 bg-canvas">
      {state !== 'ready' && (
        <div
          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-canvas transition-opacity ${
            state === 'error' ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {state === 'loading' ? (
            <>
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-line border-t-periwinkle" />
              <span className="text-sm text-mute">Loading document…</span>
            </>
          ) : (
            <p className="text-sm text-mute">
              Couldn’t display the PDF here.{' '}
              <a
                className="font-medium text-periwinkle underline underline-offset-2"
                href={src}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open it in a new tab
              </a>
              .
            </p>
          )}
        </div>
      )}
      <iframe
        src={src}
        title={title}
        onLoad={() => setState((s) => (s === 'error' ? s : 'ready'))}
        onError={() => setState('error')}
        className="h-full w-full"
      />
    </div>
  )
}
