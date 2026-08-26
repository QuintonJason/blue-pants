'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, RotateCcw } from 'lucide-react'

interface RescoreAllButtonProps {
  assignmentId: number
  submissionCount: number
}

/**
 * Recomputes suggested scores for every submission in an assignment.
 *
 * Grades the teacher entered by hand are not affected — only the suggested score
 * and the metrics behind it.
 */
export function RescoreAllButton({ assignmentId, submissionCount }: RescoreAllButtonProps) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState('')

  if (submissionCount === 0) return null

  const handleClick = async () => {
    setRunning(true)
    setNote('')
    try {
      const res = await fetch(`/api/assignments/${assignmentId}/rescore`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setNote(body.error || 'Rescore failed')
        return
      }
      const parts = [`${body.changed} of ${body.total} changed`]
      if (body.failed > 0) parts.push(`${body.failed} failed`)
      setNote(parts.join(', '))
      router.refresh()
    } catch {
      setNote('Rescore failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {note && <span className="text-sm text-muted-foreground">{note}</span>}
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={running}
        title="Recompute suggested scores for every submission from their stored transcripts. Saved grades and notes are not changed."
      >
        {running ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <RotateCcw className="w-4 h-4 mr-2" />
        )}
        {running ? 'Rescoring...' : 'Rescore all'}
      </Button>
    </div>
  )
}
