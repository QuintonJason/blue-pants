import Link from 'next/link'
import { db } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Plus,
  Users,
  BarChart3,
  Clock,
  ArrowRight,
  LogOut
} from 'lucide-react'

async function getStats() {
  const allAssignments = await db.select().from(assignments).orderBy(desc(assignments.createdAt))
  const allSubmissions = await db.select().from(submissions)

  // Calculate stats
  const totalAssignments = allAssignments.length
  const totalSubmissions = allSubmissions.length
  const gradedSubmissions = allSubmissions.filter(s => s.finalScore !== null).length
  const pendingSubmissions = totalSubmissions - gradedSubmissions

  // Get recent assignments with submission counts
  const recentAssignments = await Promise.all(
    allAssignments.slice(0, 5).map(async (assignment) => {
      const subs = await db.select().from(submissions).where(eq(submissions.assignmentId, assignment.id))
      const graded = subs.filter(s => s.finalScore !== null).length
      return {
        ...assignment,
        submissionCount: subs.length,
        gradedCount: graded,
      }
    })
  )

  return {
    totalAssignments,
    totalSubmissions,
    gradedSubmissions,
    pendingSubmissions,
    recentAssignments,
  }
}

export default async function Dashboard() {
  const stats = await getStats()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/25">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Transcript</h1>
              <p className="text-xs text-muted-foreground">AI Collaboration Assessment</p>
            </div>
          </div>
          <form action="/api/auth/logout" method="POST">
            <Button variant="ghost" size="sm" type="submit">
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </form>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="border-0 shadow-md bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Assignments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalAssignments}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalSubmissions}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Graded
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{stats.gradedSubmissions}</div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-md bg-white">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Pending
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-500">{stats.pendingSubmissions}</div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-4 mb-8">
          <Link href="/assignments/new">
            <Button className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700 shadow-lg shadow-violet-500/25">
              <Plus className="w-4 h-4 mr-2" />
              New Assignment
            </Button>
          </Link>
          <Link href="/assignments">
            <Button variant="outline">
              View All Assignments
            </Button>
          </Link>
        </div>

        {/* Recent Assignments */}
        <Card className="border-0 shadow-lg bg-white">
          <CardHeader>
            <CardTitle className="text-lg">Recent Assignments</CardTitle>
            <CardDescription>Your latest assignments and their submission status</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentAssignments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No assignments yet</p>
                <p className="text-sm">Create your first assignment to get started</p>
                <Link href="/assignments/new" className="mt-4 inline-block">
                  <Button size="sm" className="mt-4">
                    <Plus className="w-4 h-4 mr-2" />
                    Create Assignment
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.recentAssignments.map((assignment) => (
                  <Link
                    key={assignment.id}
                    href={`/assignments/${assignment.id}`}
                    className="block"
                  >
                    <div className="flex items-center justify-between p-4 rounded-lg border bg-slate-50/50 hover:bg-slate-100/80 transition-colors group">
                      <div className="flex-1">
                        <h3 className="font-medium group-hover:text-violet-600 transition-colors">
                          {assignment.name}
                        </h3>
                        {assignment.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {assignment.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">
                              {assignment.submissionCount} submissions
                            </Badge>
                            {assignment.submissionCount > 0 && (
                              <Badge
                                variant={assignment.gradedCount === assignment.submissionCount ? 'success' : 'outline'}
                              >
                                {assignment.gradedCount}/{assignment.submissionCount} graded
                              </Badge>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-violet-600 transition-colors" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
