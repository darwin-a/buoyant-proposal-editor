'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function Uploader() {
  const [busy, setBusy] = useState<false | 'upload' | 'sample'>(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const router = useRouter()

  async function send(url: string, init: RequestInit, kind: 'upload' | 'sample') {
    setError('')
    setBusy(kind)
    const res = await fetch(url, init)
    const data = await res.json().catch(() => ({}))
    if (res.ok && data.id) {
      router.push(`/proposals/${data.id}`)
    } else {
      setBusy(false)
      setError(data.error ?? 'Something went wrong')
    }
  }

  function upload(file: File) {
    const form = new FormData()
    form.append('file', file)
    send('/api/proposals', { method: 'POST', body: form }, 'upload')
  }

  return (
    <div className="w-full max-w-md">
      <label
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) upload(file)
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 text-center transition ${
          dragging ? 'border-amber-400 bg-amber-50' : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          disabled={!!busy}
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <span className="text-2xl text-gray-300">⬆</span>
        <span className="mt-2 text-sm font-medium text-gray-700">
          {busy === 'upload' ? 'Parsing…' : 'Drop a proposal PDF, or click to choose'}
        </span>
        <span className="mt-1 text-xs text-gray-400">We’ll recover the structure and lock the key facts.</span>
      </label>

      <div className="mt-3 text-center">
        <button
          onClick={() => send('/api/proposals/sample', { method: 'POST' }, 'sample')}
          disabled={!!busy}
          className="text-sm text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline disabled:opacity-40"
        >
          {busy === 'sample' ? 'Loading sample…' : '▸ or try a sample proposal'}
        </button>
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
    </div>
  )
}
