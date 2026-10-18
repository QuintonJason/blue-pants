'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Save, RotateCcw, AlertCircle } from 'lucide-react'
import { interpretScore, needsOverrideReason, weakDimensions } from '@/lib/scorer/rubric'
import type { DimensionScores, RubricConfig } from '@/lib/db/schema'

interface ScoringPanelProps {
  suggestedScore: number | null
  suggestedDimensionScores: DimensionScores | null
  currentScore: number | null
  currentDimensionScores: DimensionScores | null
  rubricConfig: RubricConfig
  teacherNotes: string | null
  onSave: (data: { finalScore: number; dimensionScores: DimensionScores; teacherNotes: string }) => Promise<void>
  className?: string
}

export const DIMENSION_LABELS: Record<keyof DimensionScores, string> = {
  problemArticulation: 'Problem Articulation',
  iterationQuality: 'Iteration Quality',
  criticalEvaluation: 'Critical Evaluation',
  codeReviewEngagement: 'Code Review Engagement',
  debuggingProcess: 'Debugging Process',
  independenceShown: 'Independence Shown',
}

export function ScoringPanel({
  suggestedScore,
  suggestedDimensionScores,
  currentScore,
  currentDimensionScores,
  rubricConfig,
  teacherNotes: initialNotes,
  onSave,
  className,
}: ScoringPanelProps) {
  const [dimensionScores, setDimensionScores] = useState<DimensionScores>(
    currentDimensionScores || suggestedDimensionScores || {
      problemArticulation: 50,
      iterationQuality: 50,
      criticalEvaluation: 50,
      codeReviewEngagement: 50,
      debuggingProcess: 50,
      independenceShown: 50,
    }
  )
  const [notes, setNotes] = useState(initialNotes || '')
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // Calculate weighted total
  const calculateTotal = (scores: DimensionScores) => {
    const totalWeight = Object.values(rubricConfig).reduce((sum, w) => sum + w, 0)
    const weightedSum =
      (scores.problemArticulation * rubricConfig.problemArticulation) +
      (scores.iterationQuality * rubricConfig.iterationQuality) +
      (scores.criticalEvaluation * rubricConfig.criticalEvaluation) +
      (scores.codeReviewEngagement * rubricConfig.codeReviewEngagement) +
      (scores.debuggingProcess * rubricConfig.debuggingProcess) +
      (scores.independenceShown * rubricConfig.independenceShown)
    return Math.round(weightedSum / totalWeight)
  }

  const totalScore = calculateTotal(dimensionScores)
  const interpretation = interpretScore(totalScore)
  const weak = weakDimensions(dimensionScores, rubricConfig)
  const reasonRequired = needsOverrideReason(totalScore, suggestedScore) && !notes.trim()
  const gap = suggestedScore !== null ? totalScore - Math.round(suggestedScore) : 0

  const handleDimensionChange = (key: keyof DimensionScores, value: number[]) => {
    setDimensionScores(prev => ({ ...prev, [key]: value[0] }))
    setHasChanges(true)
  }

  const handleReset = () => {
    if (suggestedDimensionScores) {
      setDimensionScores(suggestedDimensionScores)
      setHasChanges(currentDimensionScores !== null)
    }
  }

  const handleSave = async () => {
    if (reasonRequired) return
    setSaving(true)
    try {
      await onSave({
        finalScore: totalScore,
        dimensionScores,
        teacherNotes: notes,
      })
      setHasChanges(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Scoring</CardTitle>
            <CardDescription>
              {currentScore !== null ? 'Graded' : 'Not yet graded'}
            </CardDescription>
          </div>
          {suggestedScore !== null && (
            <Badge variant="outline">
              Suggested: {Math.round(suggestedScore)}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Total Score */}
        <div className="text-center p-4 rounded-lg bg-gradient-to-br from-violet-50 to-violet-100 border border-violet-200">
          <div className="text-4xl font-bold text-violet-700">{totalScore}%</div>
          <div className={`text-sm font-medium ${interpretation.color}`}>
            {interpretation.label}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {interpretation.description}
          </p>
          {weak.length > 0 && (
            <p className="text-xs font-medium text-amber-700 mt-1">
              {/* Not "held back by": at a 10% weight a weak dimension may cost only a few points. */}
              Low score in:{' '}
              {weak.map(key => `${DIMENSION_LABELS[key]} (${dimensionScores[key]}%)`).join(', ')}
            </p>
          )}
        </div>

        <Separator />

        {/* Dimension Scores */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Dimension Scores</Label>
            {suggestedDimensionScores && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="h-7 text-xs"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Reset to Suggested
              </Button>
            )}
          </div>

          {(Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScores>).map((key) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{DIMENSION_LABELS[key]}</span>
                <span className="font-medium tabular-nums w-12 text-right">
                  {dimensionScores[key]}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6">
                  {rubricConfig[key]}%
                </span>
                <Slider
                  value={[dimensionScores[key]]}
                  onValueChange={(v) => handleDimensionChange(key, v)}
                  max={100}
                  step={5}
                  className="flex-1"
                />
              </div>
            </div>
          ))}
        </div>

        <Separator />

        {/* Teacher Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Teacher Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value)
              setHasChanges(true)
            }}
            placeholder="Add notes about this submission..."
            rows={3}
          />
          {reasonRequired && (
            <p className="flex items-start gap-1 text-xs text-amber-700">
              <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" />
              Your grade is {Math.abs(gap)} points {gap > 0 ? 'above' : 'below'} the suggestion. Say why
              in your notes; it&apos;s recorded with the grade.
            </p>
          )}
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving || reasonRequired}
          className="w-full bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : currentScore !== null ? 'Update Grade' : 'Save Grade'}
        </Button>
      </CardContent>
    </Card>
  )
}
