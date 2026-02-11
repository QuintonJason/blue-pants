import Link from 'next/link'
import { db, initializeDatabase } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Plus,
  ArrowLeft,
  ArrowRight,
  Calendar
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

async function getAssignments() {
  initializeDatabase()

  const allAssignments = await db.select().from(assignments).orderBy(desc(assignments.createdAt))

  return Promise.all(
    allAssignments.map(async (assignment) => {
      const subs = await db.select().from(submissions).where(eq(submissions.assignmentId, assignment.id))
      const graded = subs.filter(s => s.finalScore !== null).length
      const avgScore = subs.length > 0
        ? Math.round(subs.reduce((sum, s) => sum + (s.finalScore || s.suggestedScore || 0), 0) / subs.length)
        : null
      return {
        ...assignment,
        submissionCount: subs.length,
        gradedCount: graded,
        averageScore: avgScore,
      }
    })
  )
}

export default async function AssignmentsPage() {
  const assignmentList = await getAssignments()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Assignments</h1>
              <p className="text-sm text-muted-foreground">Manage your assignments and view submissions</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <p className="text-muted-foreground">
            {assignmentList.length} assignment{assignmentList.length !== 1 ? 's' : ''}
          </p>
          <Link href="/assignments/new">
            <Button className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700">
              <Plus className="w-4 h-4 mr-2" />
              New Assignment
            </Button>
          </Link>
        </div>

        {/* Assignments List */}
        {assignmentList.length === 0 ? (
          <Card className="border-0 shadow-lg">
            <CardContent className="text-center py-16">
              <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No assignments yet</h3>
              <p className="text-muted-foreground mb-6">Create your first assignment to start collecting submissions</p>
              <Link href="/assignments/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Assignment
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {assignmentList.map((assignment) => (
              <Link key={assignment.id} href={`/assignments/${assignment.id}`}>
                <Card className="border-0 shadow-md hover:shadow-lg transition-shadow cursor-pointer group">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold group-hover:text-violet-600 transition-colors">
                          {assignment.name}
                        </h3>
                        {assignment.description && (
                          <p className="text-muted-foreground mt-1 line-clamp-2">
                            {assignment.description}
                          </p>
                        )}
                        <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(assignment.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {assignment.submissionCount} submissions
                          </Badge>
                          {assignment.submissionCount > 0 && (
                            <Badge
                              variant={assignment.gradedCount === assignment.submissionCount ? 'success' : 'warning'}
                            >
                              {assignment.gradedCount}/{assignment.submissionCount} graded
                            </Badge>
                          )}
                        </div>
                        {assignment.averageScore !== null && (
                          <span className="text-sm text-muted-foreground">
                            Avg: {assignment.averageScore}%
                          </span>
                        )}
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-600 transition-colors mt-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
