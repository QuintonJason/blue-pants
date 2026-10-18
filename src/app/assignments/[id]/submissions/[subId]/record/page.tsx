'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DIMENSION_LABELS } from '@/components/scoring-panel'
import { formatDateTime } from '@/lib/utils'
import { parseGradeRecords, type GradeRecord } from '@/lib/scorer/grade-record'
import { flaggedMessages } from '@/lib/analyzer/intent-overrides'
import { interpretAiLikelihood } from '@/lib/analyzer/code-smell'
import type { FeedbackPoint } from '@/lib/analyzer/feedback'
import type { Assignment, DimensionScores, Submission } from '@/lib/db/schema'
import type { ParsedChat } from '@/lib/parser/chatgpt'

type SubmissionResponse = Submission & { evidenceChangedSinceGrade?: boolean }

const QUOTE_MAX = 200

/**
 * One printable page per graded submission, for an appeal: the grade history,
 * what each grade was given on (rubric, scoring rules, suggestion), the evidence
 * fingerprint and whether the stored evidence still matches it, the AI-use
 * summary and flag rulings as recorded with the latest grade, and the notes.
 */
export default function GradeRecordPage() {
  const params = useParams()
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/submissions/${params.subId}`).then(r => r.json()),
      fetch(`/api/assignments/${params.id}`).then(r => r.json()),
    ])
      .then(([sub, assign]) => {
        setSubmission(sub)
        setAssignment(assign)
      })
      .catch(() => setError('Failed to load the grade record'))
  }, [params.id, params.subId])

  if (error) return <p className="p-8 text-destructive">{error}</p>
  if (!submission || !assignment) return <p className="p-8 text-muted-foreground">Loading…</p>

  const records = parseGradeRecords(submission.gradeRecords)
  const latest = records.at(-1)
  const back = `/assignments/${params.id}/submissions/${params.subId}`

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b print:hidden">
        <div className="container mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <Link href={back}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to submission
            </Button>
          </Link>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Print / Save PDF
          </Button>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-8 space-y-6 text-sm print:py-0">
        <div>
          <h1 className="text-2xl font-bold">Grade record: {submission.studentName}</h1>
          <p className="text-muted-foreground">
            {assignment.name} · submitted {formatDateTime(submission.submittedAt)} · printed{' '}
            {formatDateTime(new Date())}
          </p>
        </div>

        {!latest ? (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
            {submission.finalScore === null
              ? 'This submission has not been graded.'
              : `Graded ${submission.finalScore}% before grade records were kept, so what the grade was given on was not recorded. Saving the grade again records it.`}
          </p>
        ) : (
          <>
            <Section title="Grade history">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1 pr-3 font-medium">Recorded</th>
                    <th className="py-1 pr-3 font-medium">Grade</th>
                    <th className="py-1 pr-3 font-medium">Suggested</th>
                    <th className="py-1 pr-3 font-medium">Scoring rules</th>
                    <th className="py-1 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map(record => (
                    <tr key={record.recordedAt} className="border-b align-top">
                      <td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(record.recordedAt)}</td>
                      <td className="py-1 pr-3 font-medium">{record.finalScore}%</td>
                      <td className="py-1 pr-3">
                        {record.suggestedScore === null ? '—' : `${Math.round(record.suggestedScore)}%`}
                        {record.suggestionStale.length > 0 && ' (outdated)'}
                      </td>
                      <td className="py-1 pr-3 whitespace-nowrap">{record.scorerVersion}</td>
                      <td className="py-1 whitespace-pre-wrap">{record.teacherNotes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <Section title="Evidence">
              <p>
                Transcript fingerprint <Hash value={latest.evidence?.chatSha256} />, code fingerprint{' '}
                <Hash value={latest.evidence?.codeSha256} /> (SHA-256, as recorded with the latest grade).
              </p>
              <p className="mt-1 font-medium">
                {!latest.evidence
                  ? 'Recorded before fingerprints were taken.'
                  : submission.evidenceChangedSinceGrade
                    ? 'The stored transcript or code has changed since this grade was recorded.'
                    : 'The stored transcript and code match what the grade was given on.'}
              </p>
            </Section>

            {latest.dimensionScores && (
              <Section title="Rubric">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1 pr-3 font-medium">Dimension</th>
                      <th className="py-1 pr-3 font-medium">Weight</th>
                      <th className="py-1 pr-3 font-medium">Suggested</th>
                      <th className="py-1 font-medium">Given</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(DIMENSION_LABELS) as Array<keyof DimensionScores>).map(key => (
                      <tr key={key} className="border-b">
                        <td className="py-1 pr-3">{DIMENSION_LABELS[key]}</td>
                        <td className="py-1 pr-3">{latest.rubric[key]}%</td>
                        <td className="py-1 pr-3">
                          {latest.suggestedDimensionScores ? `${latest.suggestedDimensionScores[key]}%` : '—'}
                        </td>
                        <td className="py-1 font-medium">{latest.dimensionScores![key]}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {latest.feedback ? (
              <RecordedSummary record={latest} chats={parseChats(submission.chatExports)} />
            ) : latest.aiLikelihoodScore !== null ? (
              <Section title="Code-only evidence">
                <p>
                  No transcript. Code signals: {interpretAiLikelihood(latest.aiLikelihoodScore).label.toLowerCase()} (
                  {Math.round(latest.aiLikelihoodScore)}/100, rules {latest.aiLikelihoodScorerVersion ?? 'unknown'}). This
                  is a heuristic: a reason to ask for the student&apos;s process, not evidence of misconduct.
                </p>
              </Section>
            ) : null}
          </>
        )}

        <p className="border-t pt-3 text-xs text-muted-foreground">
          The suggested scores and flags come from rules applied to the student&apos;s transcript and code. Every
          grade above was given by the teacher, who can review and overrule each flag.
        </p>
      </main>
    </div>
  )
}

function RecordedSummary({ record, chats }: { record: GradeRecord; chats: ParsedChat[] }) {
  const feedback = record.feedback!
  const flagged = flaggedMessages(chats, record.intentOverrides ?? {})
  return (
    <>
      <Section title="How they used AI (as recorded with the latest grade)">
        <div className="grid grid-cols-2 gap-4">
          <Points heading="Doing well" points={feedback.strengths} />
          <Points heading="To work on" points={feedback.improvements} />
        </div>
        {feedback.notes.length > 0 && <p className="mt-2 text-muted-foreground">{feedback.notes.join(' ')}</p>}
      </Section>
      {flagged.length > 0 && (
        <Section title="Flagged messages and rulings">
          <ul className="space-y-2">
            {flagged.map(message => (
              <li key={message.anchor}>
                <span className="font-medium">
                  {[
                    flagLabel('Hand-off', 'counted against Independence', message.detected.delegation, message.counted.delegation),
                    flagLabel('Off-topic', 'left out of scoring', message.detected.offTopic, message.counted.offTopic),
                  ]
                    .filter(Boolean)
                    .join('; ')}
                  :
                </span>{' '}
                <span className="italic text-muted-foreground">&ldquo;{clip(message.text)}&rdquo;</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  )
}

function flagLabel(kind: string, effect: string, detected: boolean, counted: boolean): string | null {
  if (detected && counted) return `${kind}, ${effect}`
  if (detected) return `${kind}, overruled by the teacher`
  if (counted) return `${kind} by the teacher's ruling, ${effect}`
  return null
}

function Points({ heading, points }: { heading: string; points: FeedbackPoint[] }) {
  return (
    <div>
      <h3 className="font-medium mb-1">{heading}</h3>
      {points.length === 0 ? (
        <p className="text-muted-foreground">Nothing recorded.</p>
      ) : (
        <ul className="space-y-2">
          {points.map(point => (
            <li key={point.id}>
              <p className="font-medium">{point.title}</p>
              <p className="text-muted-foreground">{point.detail}</p>
              {point.examples.map(example => (
                <p key={example.anchor} className="italic text-muted-foreground border-l-2 pl-2 mt-1">
                  &ldquo;{clip(example.text)}&rdquo;
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="text-base font-semibold mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Hash({ value }: { value: string | null | undefined }) {
  return <code className="text-xs">{value ? value.slice(0, 16) : 'none'}</code>
}

function clip(text: string) {
  return text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX)}…` : text
}

function parseChats(stored: string | null): ParsedChat[] {
  try {
    const parsed = JSON.parse(stored || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
