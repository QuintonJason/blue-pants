'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { ChatViewer } from '@/components/chat-viewer'
import { CodeDiff } from '@/components/code-diff'
import { MetricsPanel } from '@/components/metrics-panel'
import { ScoringPanel } from '@/components/scoring-panel'
import { AiLikelihoodPanel } from '@/components/ai-likelihood-panel'
import { TranscriptRequestPanel } from '@/components/transcript-request-panel'
import { ManualGradePanel } from '@/components/manual-grade-panel'
import {
  ArrowLeft,
  MessageSquare,
  Code,
  BarChart3,
  User,
  Calendar,
  Trash2,
  AlertTriangle,
  Eye,
  PenLine,
  Check,
  Loader2,
  RotateCcw
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { parseRubricSnapshot, rubricsMatch } from '@/lib/scorer/rubric'
import type { Submission, Assignment, ComputedMetrics, DimensionScores, RubricConfig, CodeSmellSignalResult } from '@/lib/db/schema'
import type { ParsedChat, CodeBlock } from '@/lib/parser/chatgpt'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface SubmissionData extends Submission {
  parsedChats: ParsedChat[]
  parsedMetrics: ComputedMetrics
  parsedDimensionScores: DimensionScores | null
  parsedSuggestedDimensionScores: DimensionScores | null
  parsedAiCode: CodeBlock[]
  parsedAiLikelihoodSignals: CodeSmellSignalResult[]
}

/** Parse the JSON-string columns on a raw submission row into the shape the UI wants. */
function hydrateSubmission(sub: Submission): SubmissionData {
  return {
    ...sub,
    parsedChats: JSON.parse(sub.chatExports || '[]'),
    parsedMetrics: JSON.parse(sub.computedMetrics || '{}'),
    parsedDimensionScores: sub.dimensionScores ? JSON.parse(sub.dimensionScores) : null,
    parsedSuggestedDimensionScores: sub.suggestedDimensionScores
      ? JSON.parse(sub.suggestedDimensionScores)
      : null,
    parsedAiCode: JSON.parse(sub.aiCodeSnippets || '[]'),
    parsedAiLikelihoodSignals: sub.aiLikelihoodSignals ? JSON.parse(sub.aiLikelihoodSignals) : [],
  }
}

export default function SubmissionReviewPage() {
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.id
  const submissionId = params.subId

  const [submission, setSubmission] = useState<SubmissionData | null>(null)
  const [allowPreviewScripts, setAllowPreviewScripts] = useState(false)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [reflection, setReflection] = useState('')
  const [savingReflection, setSavingReflection] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [rescoreNote, setRescoreNote] = useState('')
  const [reflectionSaved, setReflectionSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/submissions/${submissionId}`).then(r => r.json()),
      fetch(`/api/assignments/${assignmentId}`).then(r => r.json()),
    ])
      .then(([sub, assign]) => {
        setSubmission(hydrateSubmission(sub))
        setReflection(sub.selfReflection || '')
        setAssignment(assign)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load submission')
        setLoading(false)
      })
  }, [submissionId, assignmentId])

  const handleRescore = async () => {
    setRescoring(true)
    setRescoreNote('')
    try {
      const res = await fetch(`/api/submissions/${submissionId}/rescore`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Failed to recompute the suggested score')
        return
      }

      const sub = body.submission
      setSubmission(hydrateSubmission(sub))
      setRescoreNote(
        sub.submissionMode === 'code_only'
          ? body.previousAiLikelihoodScore === body.aiLikelihoodScore
            ? `Unchanged at ${body.aiLikelihoodScore}`
            : `AI-likelihood ${body.previousAiLikelihoodScore ?? '—'} → ${body.aiLikelihoodScore}`
          : body.previousSuggestedScore === body.suggestedScore
          ? `Unchanged at ${body.suggestedScore}%`
          : `Suggested score ${body.previousSuggestedScore ?? '—'}% → ${body.suggestedScore}%`
      )
    } catch {
      setError('Failed to recompute the suggested score')
    } finally {
      setRescoring(false)
    }
  }

  const handleTranscriptUpdated = (sub: Submission) => {
    setSubmission(hydrateSubmission(sub))
  }

  const handleSave = async (data: { finalScore: number; dimensionScores?: DimensionScores; teacherNotes: string }) => {
    const res = await fetch(`/api/submissions/${submissionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      throw new Error('Failed to save')
    }

    const updated = await res.json()
    setSubmission(prev => prev ? {
      ...prev,
      finalScore: updated.finalScore,
      dimensionScores: updated.dimensionScores,
      teacherNotes: updated.teacherNotes,
      parsedDimensionScores: data.dimensionScores ?? prev.parsedDimensionScores,
    } : null)
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/submissions/${submissionId}`, { method: 'DELETE' })
      router.push(`/assignments/${assignmentId}`)
    } catch {
      setError('Failed to delete submission')
      setDeleting(false)
    }
  }

  const handleSaveReflection = async () => {
    setSavingReflection(true)
    setReflectionSaved(false)
    try {
      const res = await fetch(`/api/submissions/${submissionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfReflection: reflection }),
      })

      if (!res.ok) throw new Error('Failed to save')

      setSubmission(prev => prev ? { ...prev, selfReflection: reflection } : null)
      setReflectionSaved(true)
      setTimeout(() => setReflectionSaved(false), 2000)
    } catch {
      setError('Failed to save reflection')
    } finally {
      setSavingReflection(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading submission...</p>
      </div>
    )
  }

  if (!submission || !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">Submission not found</p>
      </div>
    )
  }

  const rubricConfig: RubricConfig = JSON.parse(assignment.rubricConfig)

  // The suggested score was computed under whatever rubric was in force at the
  // time. If the assignment's weights have changed since, the stored score no
  // longer matches the weights shown beside it.
  const scoredUnder = parseRubricSnapshot(submission.rubricSnapshot)
  const rubricChanged = !rubricsMatch(scoredUnder, rubricConfig)
  const allAiCode = submission.parsedAiCode.map(b => b.code).join('\n\n')
  const isCodeOnly = submission.submissionMode === 'code_only'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/assignments/${assignmentId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{submission.studentName}</h1>
                  {submission.finalScore !== null ? (
                    <Badge variant="success">{submission.finalScore}%</Badge>
                  ) : (
                    <Badge variant="outline">Not Graded</Badge>
                  )}
                  {isCodeOnly && (
                    <Badge variant="warning" title="No chat transcript exists for this submission">
                      No Transcript
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {assignment.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {rescoreNote && (
                <span className="text-sm text-muted-foreground">{rescoreNote}</span>
              )}
              <Button
                variant="outline"
                onClick={handleRescore}
                disabled={rescoring}
                title={
                  isCodeOnly
                    ? "Recompute the AI-likelihood signals from this submission's stored code. Your saved grade and notes are not changed."
                    : "Recompute the suggested score from this submission's stored transcript. Your saved grade and notes are not changed."
                }
              >
                {rescoring ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                {rescoring ? 'Recomputing...' : 'Recompute'}
              </Button>
              <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                    Delete Submission?
                  </DialogTitle>
                  <DialogDescription>
                    This will permanently delete the submission from {submission.studentName}.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline">Cancel</Button>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Deleting...' : 'Delete'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Submission Info */}
        <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {submission.studentName}
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {formatDateTime(submission.submittedAt)}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            {isCodeOnly ? 'No transcript' : `${submission.parsedChats.length} conversation(s)`}
          </span>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content - Chat & Code */}
          <div className="lg:col-span-2 space-y-6">
            <Tabs defaultValue={isCodeOnly ? 'code' : 'chat'} className="w-full">
              <TabsList className="w-full justify-start">
                {!isCodeOnly && (
                  <TabsTrigger value="chat" className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Chat Log
                  </TabsTrigger>
                )}
                {!isCodeOnly && (
                  <TabsTrigger value="diff" className="flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Code Comparison
                  </TabsTrigger>
                )}
                {isCodeOnly && (
                  <TabsTrigger value="code" className="flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Code
                  </TabsTrigger>
                )}
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  Preview
                </TabsTrigger>
                {!isCodeOnly && (
                  <TabsTrigger value="metrics" className="flex items-center gap-2 lg:hidden">
                    <BarChart3 className="w-4 h-4" />
                    Metrics
                  </TabsTrigger>
                )}
              </TabsList>

              {!isCodeOnly && (
              <TabsContent value="chat" className="mt-4">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">Conversation History</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChatViewer chats={submission.parsedChats} />
                  </CardContent>
                </Card>
              </TabsContent>
              )}

              {!isCodeOnly && (
              <TabsContent value="diff" className="mt-4">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">AI Code vs Final Submission</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CodeDiff
                      aiCode={allAiCode}
                      finalCode={submission.finalCode || ''}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
              )}

              {isCodeOnly && (
              <TabsContent value="code" className="mt-4">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">Submitted Code</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-xs font-mono bg-muted/40 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
                      {submission.finalCode || 'No code submitted'}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
              )}

              <TabsContent value="preview" className="mt-4">
                <Card className="border-0 shadow-lg">
                  <CardHeader>
                    <CardTitle className="text-base">Live Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {submission.finalCode ? (
                      <div className="space-y-3">
                        {/* Submitted code is untrusted. Scripts stay off unless asked for. */}
                        <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
                          <div className="flex items-start gap-2 text-sm text-muted-foreground">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
                            <span>
                              {allowPreviewScripts
                                ? 'Scripts are running. This is student-submitted code.'
                                : 'Rendering markup only. Scripts are disabled.'}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => setAllowPreviewScripts(v => !v)}
                          >
                            {allowPreviewScripts ? 'Disable scripts' : 'Enable scripts'}
                          </Button>
                        </div>
                        <div className="border rounded-lg overflow-hidden bg-white">
                          <iframe
                            key={allowPreviewScripts ? 'scripts-on' : 'scripts-off'}
                            srcDoc={submission.finalCode}
                            sandbox={allowPreviewScripts ? 'allow-scripts' : ''}
                            referrerPolicy="no-referrer"
                            className="w-full h-[600px]"
                            title="Code Preview"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No final code submitted to preview</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {!isCodeOnly && (
              <TabsContent value="metrics" className="mt-4 lg:hidden">
                <MetricsPanel metrics={submission.parsedMetrics} />
              </TabsContent>
              )}
            </Tabs>
          </div>

          {/* Sidebar - Metrics & Scoring */}
          <div className="space-y-6">
            {isCodeOnly ? (
              <TranscriptRequestPanel
                submissionId={submission.id}
                transcriptStatus={submission.transcriptStatus}
                transcriptRequestedAt={submission.transcriptRequestedAt}
                onUpdated={handleTranscriptUpdated}
                className="border-0 shadow-lg"
              />
            ) : (
              <div className="hidden lg:block">
                <MetricsPanel metrics={submission.parsedMetrics} className="border-0 shadow-lg" />
              </div>
            )}

            {/* Student Self-Reflection */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PenLine className="w-4 h-4 text-violet-600" />
                    <CardTitle className="text-base">Student Reflection</CardTitle>
                  </div>
                  {submission.selfReflection ? (
                    <Badge variant="success" className="text-xs">Submitted</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Missing</Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  Student&apos;s metacognitive reflection on their AI collaboration
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Reflection prompts:&#10;• What did you learn from this AI interaction?&#10;• How did you verify the AI's suggestions?&#10;• What would you do differently next time?"
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  rows={6}
                  className="text-sm resize-none"
                />
                <Button
                  size="sm"
                  onClick={handleSaveReflection}
                  disabled={savingReflection || reflection === (submission.selfReflection || '')}
                  className="w-full"
                >
                  {savingReflection ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : reflectionSaved ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Saved
                    </>
                  ) : (
                    'Save Reflection'
                  )}
                </Button>
              </CardContent>
            </Card>

            {isCodeOnly ? (
              <>
                <AiLikelihoodPanel
                  score={submission.aiLikelihoodScore}
                  signals={submission.parsedAiLikelihoodSignals}
                  scorerVersion={submission.aiLikelihoodScorerVersion}
                  className="border-0 shadow-lg"
                />
                <ManualGradePanel
                  currentScore={submission.finalScore}
                  teacherNotes={submission.teacherNotes}
                  onSave={handleSave}
                  className="border-0 shadow-lg"
                />
              </>
            ) : (
              <>
                {rubricChanged && submission.suggestedScore !== null && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-1">
                        <p className="font-medium">
                          {scoredUnder
                            ? "Suggested under a different rubric"
                            : "Rubric used for this suggestion is unknown"}
                        </p>
                        <p>
                          {scoredUnder
                            ? "The assignment's weights have changed since this was scored, so the suggestion below does not reflect the weights now shown."
                            : "This submission was scored before the rubric was recorded, so its suggestion cannot be checked against the current weights."}{' '}
                          Use Recompute to score it under the current rubric.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <ScoringPanel
                  suggestedScore={submission.suggestedScore}
                  suggestedDimensionScores={submission.parsedSuggestedDimensionScores}
                  currentScore={submission.finalScore}
                  currentDimensionScores={submission.parsedDimensionScores}
                  rubricConfig={rubricConfig}
                  teacherNotes={submission.teacherNotes}
                  onSave={handleSave}
                  className="border-0 shadow-lg"
                />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
