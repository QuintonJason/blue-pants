'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquarePlus, Upload, CheckCircle, X, FileJson, Loader2 } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { Submission } from '@/lib/db/schema'

interface TranscriptRequestPanelProps {
  submissionId: number
  transcriptStatus: Submission['transcriptStatus']
  transcriptRequestedAt: string | null
  onUpdated: (updated: Submission) => void
  className?: string
}

interface UploadedFile {
  name: string
  content: string
}

// Drives the code_only -> chat workflow: mark a transcript requested, then upload it via POST /add-transcript to upgrade.
export function TranscriptRequestPanel({
  submissionId,
  transcriptStatus,
  transcriptRequestedAt,
  onUpdated,
  className,
}: TranscriptRequestPanelProps) {
  const [marking, setMarking] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [error, setError] = useState('')

  const handleMarkRequested = async () => {
    setMarking(true)
    setError('')
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcriptStatus: 'requested' }),
      })
      if (!res.ok) throw new Error()
      onUpdated(await res.json())
    } catch {
      setError('Failed to mark the transcript as requested')
    } finally {
      setMarking(false)
    }
  }

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list) return
    for (const file of Array.from(list)) {
      try {
        const content = await file.text()
        JSON.parse(content)
        setFiles(prev => [...prev, { name: file.name, content }])
      } catch {
        setError(`Invalid JSON file: ${file.name}`)
      }
    }
    e.target.value = ''
  }, [])

  const handleSubmitTranscript = async () => {
    setUploading(true)
    setError('')
    try {
      const res = await fetch(`/api/submissions/${submissionId}/add-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatExports: files.map(f => f.content) }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Failed to add transcript')
      onUpdated(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add transcript')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Transcript</CardTitle>
          {transcriptStatus === 'requested' ? (
            <Badge variant="warning" className="text-xs">Requested</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Not requested</Badge>
          )}
        </div>
        <CardDescription>
          No chat export exists for this submission. Ask the student for one, then add
          it here to upgrade this submission onto the full collaboration rubric.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {transcriptStatus === 'requested' && transcriptRequestedAt && (
          <p className="text-xs text-muted-foreground">
            Requested {formatDateTime(transcriptRequestedAt)}
          </p>
        )}

        {transcriptStatus !== 'requested' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleMarkRequested}
            disabled={marking}
          >
            {marking ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <MessageSquarePlus className="w-4 h-4 mr-2" />
            )}
            Mark transcript requested
          </Button>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((file, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  <span className="font-medium">{file.name}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setFiles(prev => prev.filter((_, i) => i !== index))}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <label className="block">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-colors cursor-pointer">
            <FileJson className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-xs font-medium">Upload chat export (JSON)</p>
          </div>
          <input
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </label>

        {files.length > 0 && (
          <Button
            type="button"
            size="sm"
            className="w-full bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
            onClick={handleSubmitTranscript}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? 'Scoring...' : 'Add transcript & upgrade grading'}
          </Button>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
