'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, ArrowUpRight, Copy, Check, Sparkles, Lock } from 'lucide-react'
import { buildAiUseFeedback, feedbackToText, type FeedbackPoint } from '@/lib/analyzer/feedback'
import { computeAggregateMetrics } from '@/lib/analyzer/metrics'
import { MetricsDetails } from '@/components/metrics-details'
import type { ParsedChat } from '@/lib/parser/chatgpt'
import type { GradeRecord } from '@/lib/scorer/grade-record'
import { TRANSCRIPT_SCORER_VERSION } from '@/lib/scorer/pipeline'
import { formatDateTime } from '@/lib/utils'

interface AiUseSummaryProps {
  chats: ParsedChat[]
  finalCode: string | null
  /** Show the quoted message in the chat log (receives a messageAnchor). */
  onQuoteClick?: (anchor: string) => void
  /**
   * Records of each saved grade, oldest first; pass only for a graded
   * submission. The latest record's summary is shown instead of a live one, so a
   * graded submission keeps the evidence its grade was given on.
   */
  gradeRecords?: GradeRecord[]
  className?: string
}

/**
 * How the student used the AI: strengths and things to work on, each backed by
 * quotes from their own messages. Written to the student, so it can be copied
 * straight into feedback.
 */
export function AiUseSummary({ chats, finalCode, onQuoteClick, gradeRecords, className }: AiUseSummaryProps) {
  const graded = gradeRecords !== undefined
  const records = gradeRecords ?? []
  const recorded = [...records].reverse().find(r => r.feedback && r.metrics)
  const rulesChanged = !!recorded && recorded.scorerVersion !== TRANSCRIPT_SCORER_VERSION
  const [showCurrent, setShowCurrent] = useState(false)
  const showingRecord = !!recorded && !showCurrent

  // The live analysis is only computed when it's what's on screen.
  const live = useMemo(
    () =>
      showingRecord
        ? null
        : { feedback: buildAiUseFeedback(chats, finalCode), metrics: computeAggregateMetrics(chats) },
    [showingRecord, chats, finalCode]
  )
  const feedback = showingRecord ? recorded.feedback! : live!.feedback
  // Shown beside the summary they came from, so the counts can't disagree with its points.
  const metrics = showingRecord ? recorded.metrics! : live!.metrics
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(feedbackToText(feedback))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable (permissions, insecure context); nothing to undo.
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            How they used AI
          </CardTitle>
          <CardDescription>
            Written to the student. Click a quote to see it in the chat before sharing.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={copy} className="shrink-0">
          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
          {copied ? 'Copied' : 'Copy as feedback'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {recorded && (
          <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="flex items-start gap-2">
              <Lock className="w-3.5 h-3.5 mt-px shrink-0" />
              <span>
                {showingRecord
                  ? `As recorded when graded ${formatDateTime(recorded.recordedAt)}, under scoring rules ${recorded.scorerVersion}.`
                  : `Current analysis under scoring rules ${TRANSCRIPT_SCORER_VERSION}. The grade was given on the version recorded ${formatDateTime(recorded.recordedAt)}.`}
                {records.length > 1 &&
                  ` Grade history: ${records.map(r => `${r.finalScore}% (${formatDateTime(r.recordedAt)})`).join(' → ')}.`}
              </span>
            </span>
            {rulesChanged && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setShowCurrent(v => !v)}>
                {showCurrent ? 'Show as graded' : 'Show current analysis'}
              </Button>
            )}
          </div>
        )}
        {graded && records.length === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <Lock className="w-3.5 h-3.5 mt-px shrink-0" />
            <span>
              Graded before the evidence behind grades was recorded, so this is the current analysis,
              not necessarily what the grade was given on. Saving the grade again records it.
            </span>
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-5">
          <Section
            heading="Doing well"
            points={feedback.strengths}
            empty="Nothing stood out yet."
            icon={<CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
            onQuoteClick={onQuoteClick}
          />
          <Section
            heading="To work on"
            points={feedback.improvements}
            empty="Nothing to flag."
            icon={<ArrowUpRight className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
            onQuoteClick={onQuoteClick}
          />
        </div>
        {feedback.notes.length > 0 && (
          <p className="text-xs text-muted-foreground border-t pt-3">{feedback.notes.join(' ')}</p>
        )}
        <details className="group border-t pt-3">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground select-none">
            The numbers behind this
          </summary>
          <MetricsDetails metrics={metrics} className="grid sm:grid-cols-2 gap-2 mt-3" />
        </details>
      </CardContent>
    </Card>
  )
}

function Section({
  heading,
  points,
  empty,
  icon,
  onQuoteClick,
}: {
  heading: string
  points: FeedbackPoint[]
  empty: string
  icon: React.ReactNode
  onQuoteClick?: (anchor: string) => void
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-3">{heading}</h3>
      {points.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-4">
          {points.map(point => (
            <li key={point.title} className="flex gap-2">
              {icon}
              <div className="min-w-0">
                <p className="text-sm font-medium">{point.title}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{point.detail}</p>
                {point.examples.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {point.examples.map(example => (
                      <li
                        key={example.anchor}
                        className="text-xs italic text-muted-foreground border-l-2 border-muted pl-2 break-words"
                      >
                        {onQuoteClick ? (
                          <button
                            type="button"
                            onClick={() => onQuoteClick(example.anchor)}
                            className="text-left italic hover:text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-sm"
                            title="Show in chat"
                          >
                            &ldquo;{example.text}&rdquo;
                          </button>
                        ) : (
                          <>&ldquo;{example.text}&rdquo;</>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
