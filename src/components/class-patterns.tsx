'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lightbulb, Sparkles } from 'lucide-react'
import { FINDINGS, classPatterns, type ClassPattern } from '@/lib/analyzer/feedback'
import type { Submission } from '@/lib/db/schema'

/**
 * AI-use habits shared across the class, from the findings stored with each
 * score: what to teach next, rather than what to tell one student.
 */
export function ClassPatterns({ submissions, className }: { submissions: Submission[]; className?: string }) {
  const patterns = useMemo(() => classPatterns(submissions), [submissions])

  if (patterns.analyzed === 0 && patterns.notAnalyzed === 0) return null

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          AI Use Across the Class
        </CardTitle>
        <CardDescription>
          How many of the {patterns.analyzed} analyzed students share each habit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {patterns.notAnalyzed > 0 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:border-gray-300 print:bg-gray-50">
            {patterns.notAnalyzed} submission{patterns.notAnalyzed === 1 ? ' was' : 's were'} scored before
            this was tracked and {patterns.notAnalyzed === 1 ? "isn't" : "aren't"} included. Rescore the
            assignment to include {patterns.notAnalyzed === 1 ? 'it' : 'them'}.
          </div>
        )}
        {patterns.analyzed > 0 && (
          <div className="grid md:grid-cols-2 gap-6 print:grid-cols-2">
            <PatternList
              heading="Habits to work on"
              patterns={patterns.improvements}
              total={patterns.analyzed}
              showTips
            />
            <PatternList heading="Going well" patterns={patterns.strengths} total={patterns.analyzed} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PatternList({
  heading,
  patterns,
  total,
  showTips = false,
}: {
  heading: string
  patterns: ClassPattern[]
  total: number
  showTips?: boolean
}) {
  // One student's habit belongs in their own summary; this view is for shared ones.
  const shared = patterns.filter(p => total <= 2 || p.students.length >= 2)
  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">{heading}</h4>
      {shared.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing shared by more than one student.</p>
      ) : (
        <ul className="space-y-3">
          {shared.map(pattern => {
            const copy = FINDINGS[pattern.id]
            const share = pattern.students.length / total
            return (
              <li key={pattern.id} className="text-sm break-inside-avoid">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium">{copy.classLabel}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {pattern.students.length} of {total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-slate-100 print:bg-gray-200">
                  <div
                    className={showTips ? 'h-1.5 rounded bg-amber-500' : 'h-1.5 rounded bg-green-500'}
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{pattern.students.join(', ')}</p>
                {showTips && copy.teachingTip && (
                  <p className="mt-1 text-xs flex items-start gap-1">
                    <Lightbulb className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-px" />
                    {copy.teachingTip}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
