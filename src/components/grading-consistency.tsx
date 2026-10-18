'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Scale } from 'lucide-react'
import { gradingConsistency } from '@/lib/scorer/consistency'
import { OVERRIDE_REASON_POINTS } from '@/lib/scorer/rubric'
import type { Submission } from '@/lib/db/schema'

/** Overruling more than this share of a kind of flag says the rules for it are unreliable here. */
const UNRELIABLE_SHARE = 0.2

/**
 * How the grades relate to the analysis behind them: the evidence that the tool
 * informed the teacher's judgement rather than replaced it, and a check that
 * everyone was graded under the same rules.
 */
export function GradingConsistency({ submissions, className }: { submissions: Submission[]; className?: string }) {
  const c = useMemo(() => gradingConsistency(submissions), [submissions])
  const { delegation, offTopic } = c.flags
  if (c.compared === 0 && delegation.flagged === 0 && offTopic.flagged === 0) return null

  const share = (kind: { flagged: number; overruled: number }) => (kind.flagged ? kind.overruled / kind.flagged : 0)

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Scale className="w-5 h-5" />
          Grading Consistency
        </CardTitle>
        <CardDescription>How your grades relate to the suggestions and flags behind them.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {c.scorerVersions.length > 1 && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900 print:border-gray-300 print:bg-gray-50">
            Grades here were given under {c.scorerVersions.length} versions of the scoring rules (
            {c.scorerVersions.join(', ')}). Recompute the class and save the affected grades again so
            everyone is graded under the same rules.
          </div>
        )}
        {c.compared > 0 && (
          <p>
            <span className="font-medium">Grades vs. suggestions:</span>{' '}
            {c.averageGap === 0
              ? `across ${c.compared} graded, your grades match the suggestions on average`
              : `across ${c.compared} graded, your grades are ${Math.abs(c.averageGap!)} points ${
                  c.averageGap! > 0 ? 'above' : 'below'
                } the suggestions on average`}
            . {c.departed} {c.departed === 1 ? 'is' : 'are'} {OVERRIDE_REASON_POINTS} or more points away;
            those need a written reason.
          </p>
        )}
        {([['Hand-off', delegation], ['Off-topic', offTopic]] as const).map(
          ([label, kind]) =>
            kind.flagged > 0 && (
              <p key={label}>
                <span className="font-medium">{label} flags:</span> you overruled {kind.overruled} of{' '}
                {kind.flagged}.
                {share(kind) > UNRELIABLE_SHARE &&
                  ` That's more than ${UNRELIABLE_SHARE * 100}%, so treat these flags as a prompt to check, not as evidence on their own.`}
              </p>
            )
        )}
        {c.unrecorded > 0 && (
          <p className="text-muted-foreground">
            {c.unrecorded} grade{c.unrecorded === 1 ? ' was' : 's were'} saved before grade records were
            kept, so {c.unrecorded === 1 ? 'its' : 'their'} scoring rules aren&apos;t known. Saving{' '}
            {c.unrecorded === 1 ? 'it' : 'them'} again records {c.unrecorded === 1 ? 'it' : 'them'}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
