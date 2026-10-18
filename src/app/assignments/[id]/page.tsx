import Link from 'next/link'
import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RescoreAllButton } from '@/components/rescore-all-button'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Plus,
  Settings,
  Users,
  FileText,
  BarChart3,
  Clock,
  ArrowRight,
  CheckCircle,
  Upload,
  AlertTriangle
} from 'lucide-react'
import { interpretAiLikelihood } from '@/lib/analyzer/code-smell'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { RubricConfig } from '@/lib/db/schema'
import { suggestionStaleness } from '@/lib/scorer/pipeline'
import { topFinding } from '@/lib/analyzer/feedback'

async function getAssignment(id: number) {
  const assignment = await db
    .select()
    .from(assignments)
    .where(eq(assignments.id, id))
    .limit(1)

  if (assignment.length === 0) return null

  const submissionList = await db
    .select()
    .from(submissions)
    .where(eq(submissions.assignmentId, id))
    .orderBy(desc(submissions.submittedAt))

  return {
    ...assignment[0],
    submissions: submissionList,
  }
}

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const assignmentId = parseInt(id, 10)

  if (isNaN(assignmentId)) notFound()

  const assignment = await getAssignment(assignmentId)
  if (!assignment) notFound()

  const rubricConfig: RubricConfig = JSON.parse(assignment.rubricConfig)
  const gradedCount = assignment.submissions.filter(s => s.finalScore !== null).length
  const staleCount = assignment.submissions.filter(s => suggestionStaleness(s, rubricConfig).length > 0).length
  const pendingCount = assignment.submissions.length - gradedCount
  const avgScore = assignment.submissions.length > 0
    ? Math.round(assignment.submissions.reduce((sum, s) => sum + (s.finalScore ?? s.suggestedScore ?? 0), 0) / assignment.submissions.length)
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/assignments">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold">{assignment.name}</h1>
                <p className="text-sm text-muted-foreground">
                  Created {formatDate(assignment.createdAt)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/assignments/${assignmentId}/report`}>
                <Button variant="outline" size="sm">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Report
                </Button>
              </Link>
              <Link href={`/assignments/${assignmentId}/settings`}>
                <Button variant="outline" size="sm">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Description */}
        {assignment.description && (
          <Card className="border-0 shadow-md mb-6">
            <CardContent className="py-4">
              <p className="text-muted-foreground">{assignment.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Users className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{assignment.submissions.length}</p>
                  <p className="text-xs text-muted-foreground">Submissions</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{gradedCount}</p>
                  <p className="text-xs text-muted-foreground">Graded</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{avgScore !== null ? `${avgScore}%` : '—'}</p>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Submissions */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Submissions</CardTitle>
                  <CardDescription>Student submissions for this assignment</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <RescoreAllButton
                    assignmentId={assignmentId}
                    submissionCount={assignment.submissions.length}
                    staleCount={staleCount}
                  />
                  <Link href={`/assignments/${assignmentId}/batch-import`}>
                    <Button size="sm" variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      Batch Import
                    </Button>
                  </Link>
                  <Link href={`/assignments/${assignmentId}/submit`}>
                    <Button size="sm" className="bg-gradient-to-r from-violet-500 to-violet-600">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Submission
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {assignment.submissions.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground mb-4">No submissions yet</p>
                    <Link href={`/assignments/${assignmentId}/submit`}>
                      <Button size="sm">
                        <Plus className="w-4 h-4 mr-2" />
                        Add First Submission
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignment.submissions.map((submission) => {
                      const flag = submission.submissionMode === 'chat' ? topFinding(submission.aiUseFindings) : null
                      return (
                      <Link
                        key={submission.id}
                        href={`/assignments/${assignmentId}/submissions/${submission.id}`}
                        className="block"
                      >
                        <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50/50 hover:bg-slate-100/80 transition-colors group">
                          <div>
                            <p className="font-medium group-hover:text-violet-600 transition-colors">
                              {submission.studentName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(submission.submittedAt)}
                            </p>
                            {flag && (
                              <p className="text-xs text-amber-700 flex items-center gap-1 mt-0.5" title={flag.label}>
                                <AlertTriangle className="w-3 h-3" />
                                {flag.tag}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            {submission.submissionMode === 'code_only' && (
                              <Badge variant="warning">No Transcript</Badge>
                            )}
                            {submission.finalScore !== null ? (
                              <Badge variant="success">{submission.finalScore}%</Badge>
                            ) : submission.submissionMode === 'code_only' ? (
                              submission.aiLikelihoodScore !== null && (
                                // A bare number in a list reads like a verdict; the label says what it is.
                                <Badge
                                  variant="secondary"
                                  title="Code-only heuristic: a reason to ask for their process, not evidence of misconduct"
                                >
                                  Code signals: {interpretAiLikelihood(submission.aiLikelihoodScore).label.toLowerCase()}
                                </Badge>
                              )
                            ) : submission.suggestedScore !== null ? (
                              <Badge variant="secondary">
                                ~{Math.round(submission.suggestedScore)}%
                              </Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                            <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-600" />
                          </div>
                        </div>
                      </Link>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Rubric */}
          <div>
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base">Rubric Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(rubricConfig).map(([key, weight]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-sm capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <Badge variant="outline">{weight}%</Badge>
                  </div>
                ))}
                <Separator className="my-3" />
                <div className="flex justify-between items-center font-medium">
                  <span className="text-sm">Total</span>
                  <span className="text-sm">
                    {Object.values(rubricConfig).reduce((sum, w) => sum + w, 0)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
