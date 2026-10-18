'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Download,
  FileText,
  BarChart3,
  Users,
  CheckCircle
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { suggestionStaleness } from '@/lib/scorer/pipeline'
import { ClassPatterns } from '@/components/class-patterns'
import type { Assignment, Submission, DimensionScores, RubricConfig } from '@/lib/db/schema'

interface ReportData {
  assignment: Assignment
  submissions: Submission[]
  stats: {
    total: number
    graded: number
    avgScore: number | null
    distribution: { range: string; count: number }[]
  }
}

export default function ReportPage() {
  const params = useParams()
  const assignmentId = params.id

  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/assignments/${assignmentId}`).then(r => r.json()),
      fetch(`/api/assignments/${assignmentId}/submissions`).then(r => r.json()),
    ])
      .then(([assignment, submissions]) => {
        // Calculate stats
        const graded = submissions.filter((s: Submission) => s.finalScore !== null)
        const scores = graded.map((s: Submission) => s.finalScore as number)
        const avgScore = scores.length > 0
          ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
          : null

        // Score distribution
        const distribution = [
          { range: '90-100', count: scores.filter((s: number) => s >= 90).length },
          { range: '80-89', count: scores.filter((s: number) => s >= 80 && s < 90).length },
          { range: '70-79', count: scores.filter((s: number) => s >= 70 && s < 80).length },
          { range: '60-69', count: scores.filter((s: number) => s >= 60 && s < 70).length },
          { range: 'Below 60', count: scores.filter((s: number) => s < 60).length },
        ]

        setData({
          assignment,
          submissions,
          stats: {
            total: submissions.length,
            graded: graded.length,
            avgScore,
            distribution,
          },
        })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [assignmentId])

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading report...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">Failed to load report</p>
      </div>
    )
  }

  const rubricConfig: RubricConfig = JSON.parse(data.assignment.rubricConfig)

  // Suggested scores are computed at import against the rubric and scoring rules of
  // the day. Any computed under different weights or older rules must not be
  // presented as if they came from the table below.
  const staleSubmissions = data.submissions.filter(
    (sub: Submission) => suggestionStaleness(sub, rubricConfig).length > 0
  )

  return (
    <div className="min-h-screen bg-white print:bg-white">
      {/* Header - Hidden in print */}
      <header className="border-b bg-white sticky top-0 z-40 print:hidden">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href={`/assignments/${assignmentId}`}>
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-bold">Assignment Report</h1>
                <p className="text-sm text-muted-foreground">{data.assignment.name}</p>
              </div>
            </div>
            <Button onClick={handlePrint}>
              <Download className="w-4 h-4 mr-2" />
              Print / Save PDF
            </Button>
          </div>
        </div>
      </header>

      {/* Report Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl print:px-0 print:py-4">
        {/* Report Header */}
        <div className="text-center mb-8 print:mb-4">
          <h1 className="text-2xl font-bold mb-2">{data.assignment.name}</h1>
          <p className="text-muted-foreground">AI Collaboration Assessment Report</p>
          <p className="text-sm text-muted-foreground mt-1">
            Generated on {formatDate(new Date())}
          </p>
        </div>

        {/* Summary Stats */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Summary Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-slate-50 rounded-lg print:bg-gray-100">
                <div className="text-2xl font-bold">{data.stats.total}</div>
                <div className="text-xs text-muted-foreground">Total Submissions</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg print:bg-gray-100">
                <div className="text-2xl font-bold text-green-600">{data.stats.graded}</div>
                <div className="text-xs text-muted-foreground">Graded</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg print:bg-gray-100">
                <div className="text-2xl font-bold text-orange-600">
                  {data.stats.total - data.stats.graded}
                </div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg print:bg-gray-100">
                <div className="text-2xl font-bold text-violet-600">
                  {data.stats.avgScore !== null ? `${data.stats.avgScore}%` : '—'}
                </div>
                <div className="text-xs text-muted-foreground">Average Score</div>
              </div>
            </div>

            {/* Distribution */}
            {data.stats.graded > 0 && (
              <div className="mt-4">
                <h4 className="text-sm font-medium mb-2">Score Distribution</h4>
                <div className="flex items-end gap-1 h-20">
                  {data.stats.distribution.map((d, i) => {
                    const maxCount = Math.max(...data.stats.distribution.map(x => x.count))
                    const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-violet-500 rounded-t"
                          style={{ height: `${height}%`, minHeight: d.count > 0 ? '4px' : '0' }}
                        />
                        <span className="text-xs mt-1">{d.count}</span>
                        <span className="text-xs text-muted-foreground">{d.range}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <ClassPatterns submissions={data.submissions} className="mb-6 print:shadow-none print:border" />

        {/* Rubric Used */}
        <Card className="mb-6 print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Rubric Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            {staleSubmissions.length > 0 && (
              <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:border-gray-300 print:bg-gray-50">
                {staleSubmissions.length} of {data.submissions.length} submissions were
                suggested under different weights than those shown here, or by older
                scoring rules. Rescore the assignment to bring every suggestion up to date.
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
              {Object.entries(rubricConfig).map(([key, weight]) => (
                <div key={key} className="flex justify-between p-2 bg-slate-50 rounded print:bg-gray-100">
                  <span className="capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                  <span className="font-medium">{weight}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Individual Results */}
        <Card className="print:shadow-none print:border">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="w-5 h-5" />
              Individual Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.submissions.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">No submissions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Student</th>
                      <th className="text-center py-2 px-2">Score</th>
                      <th className="text-center py-2 px-2">Status</th>
                      <th className="text-left py-2 px-2 hidden md:table-cell">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.submissions
                      .sort((a, b) => {
                        // Sort by score (descending), ungraded at end
                        const scoreA = a.finalScore ?? -1
                        const scoreB = b.finalScore ?? -1
                        return scoreB - scoreA
                      })
                      .map((sub) => (
                        <tr key={sub.id} className="border-b last:border-0">
                          <td className="py-2 px-2 font-medium">{sub.studentName}</td>
                          <td className="py-2 px-2 text-center">
                            {sub.finalScore !== null ? (
                              <span className="font-semibold">{sub.finalScore}%</span>
                            ) : sub.suggestedScore !== null ? (
                              <span className="text-muted-foreground">
                                ~{Math.round(sub.suggestedScore)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {sub.finalScore !== null ? (
                              <Badge variant="success" className="print:bg-green-100 print:text-green-800">
                                Graded
                              </Badge>
                            ) : (
                              <Badge variant="outline">Pending</Badge>
                            )}
                          </td>
                          <td className="py-2 px-2 text-muted-foreground hidden md:table-cell max-w-xs truncate">
                            {sub.teacherNotes || '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-muted-foreground print:mt-4">
          <Separator className="mb-4" />
          Generated by Transcript - AI Collaboration Assessment Tool
        </div>
      </main>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 1cm;
          }
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  )
}
