'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { AlertTriangle } from 'lucide-react'
import { interpretAiLikelihood } from '@/lib/analyzer/code-smell'
import type { CodeSmellSignalResult } from '@/lib/db/schema'

interface AiLikelihoodPanelProps {
  score: number | null
  signals: CodeSmellSignalResult[]
  className?: string
}

export function AiLikelihoodPanel({ score, signals, className }: AiLikelihoodPanelProps) {
  if (score === null) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">AI-Likelihood Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Not yet computed.</p>
        </CardContent>
      </Card>
    )
  }

  const interpretation = interpretAiLikelihood(score)
  const triggered = signals.filter(s => s.triggered)

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">AI-Likelihood Signals</CardTitle>
        <CardDescription>
          Code-only heuristic — there is no transcript for this submission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center p-4 rounded-lg bg-gradient-to-br from-amber-50 to-orange-100 border border-orange-200">
          <div className="text-4xl font-bold text-orange-700">{Math.round(score)}</div>
          <div className={`text-sm font-medium ${interpretation.color}`}>
            {interpretation.label}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{interpretation.description}</p>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-600" />
          <span>
            Heuristic evidence only, not a determination of academic dishonesty. Use it to
            decide whether to ask the student for their process — e.g. a chat export or a
            short walkthrough — not to assign a grade.
          </span>
        </div>

        <Separator />

        <div className="space-y-3">
          <p className="text-sm font-medium">Signals</p>
          {signals.map(signal => (
            <div key={signal.id} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={signal.triggered ? '' : 'text-muted-foreground'}>
                  {signal.label}
                </span>
                <Badge variant={signal.triggered ? 'secondary' : 'outline'} className="text-xs">
                  {signal.points}/{signal.maxPoints}
                </Badge>
              </div>
              {signal.evidence.length > 0 && (
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                  {signal.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {triggered.length === 0 && (
            <p className="text-xs text-muted-foreground">No signals triggered.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
