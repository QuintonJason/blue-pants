'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Save } from 'lucide-react'

interface ManualGradePanelProps {
  currentScore: number | null
  teacherNotes: string | null
  onSave: (data: { finalScore: number; teacherNotes: string }) => Promise<void>
  className?: string
}

// A plain manual grade for a code_only submission — ScoringPanel's rubric dimensions all read from a chat transcript, which doesn't exist here.
export function ManualGradePanel({ currentScore, teacherNotes: initialNotes, onSave, className }: ManualGradePanelProps) {
  const [score, setScore] = useState(currentScore ?? 0)
  const [notes, setNotes] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ finalScore: score, teacherNotes: notes })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Grade</CardTitle>
          <Badge variant="outline">{currentScore !== null ? 'Graded' : 'Not yet graded'}</Badge>
        </div>
        <CardDescription>
          No collaboration rubric applies without a transcript — enter a grade directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="finalScore">Score (%)</Label>
          <Input
            id="finalScore"
            type="number"
            min={0}
            max={100}
            value={score}
            onChange={(e) => setScore(Math.max(0, Math.min(100, Number(e.target.value))))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="notes">Teacher Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes about this submission..."
            rows={3}
          />
        </div>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : currentScore !== null ? 'Update Grade' : 'Save Grade'}
        </Button>
      </CardContent>
    </Card>
  )
}
