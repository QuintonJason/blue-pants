'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GraduationCap } from 'lucide-react'
import type { CurriculumScopeFlag } from '@/lib/db/schema'

interface CurriculumScopePanelProps {
  flags: CurriculumScopeFlag[] | null
  configured: boolean
  className?: string
}

// Techniques found in the code that the assignment's curriculumScope says aren't
// taught yet — a falsifiable, syllabus-grounded signal for the integrity track,
// stronger than aiLikelihoodScore's stylistic heuristics but still never the grade.
export function CurriculumScopePanel({ flags, configured, className }: CurriculumScopePanelProps) {
  if (!configured) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet-600" />
            Curriculum Scope
          </CardTitle>
          <CardDescription>
            Not configured for this assignment. Set which techniques are taught by
            this assignment&apos;s due date in Settings to enable this check.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-violet-600" />
          Curriculum Scope
        </CardTitle>
        <CardDescription>
          Techniques in this code that aren&apos;t marked as taught by this assignment&apos;s
          due date — a syllabus-grounded fact, not a style guess.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {flags && flags.length > 0 ? (
          flags.map(flag => (
            <div key={flag.id} className="flex items-start justify-between gap-2 text-sm">
              <span>{flag.label}</span>
              <Badge variant="outline" className="text-xs shrink-0">
                {flag.syllabusWeek !== null ? `Week ${flag.syllabusWeek}` : 'not on syllabus'}
              </Badge>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No out-of-scope techniques detected.</p>
        )}
      </CardContent>
    </Card>
  )
}
