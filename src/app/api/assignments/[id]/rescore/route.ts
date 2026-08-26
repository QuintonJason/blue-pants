import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { DEFAULT_RUBRIC_CONFIG, validateRubricConfig } from '@/lib/scorer/rubric'
import { rescoreStoredSubmission } from '@/lib/scorer/pipeline'
import type { RubricConfig } from '@/lib/db/schema'

interface RescoreResult {
  submissionId: number
  studentName: string
  previousSuggestedScore: number | null
  suggestedScore?: number
  error?: string
}

/**
 * POST - Recompute suggested scores for every submission in an assignment.
 *
 * Teacher-entered grades, notes and student reflections are never touched. One
 * unreadable submission does not stop the rest.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const assignmentId = parseInt(id, 10)

    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 })
    }

    const assignment = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1)

    if (assignment.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    let rubricConfig: RubricConfig = DEFAULT_RUBRIC_CONFIG
    if (assignment[0].rubricConfig) {
      const validated = validateRubricConfig(JSON.parse(assignment[0].rubricConfig))
      if (!validated.ok) {
        return NextResponse.json(
          { error: `Assignment rubric is invalid: ${validated.error}` },
          { status: 409 }
        )
      }
      rubricConfig = validated.value
    }

    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId))

    const results: RescoreResult[] = []

    for (const submission of rows) {
      try {
        const update = rescoreStoredSubmission(
          submission.chatExports,
          submission.finalCode,
          rubricConfig
        )
        await db.update(submissions).set(update).where(eq(submissions.id, submission.id))
        results.push({
          submissionId: submission.id,
          studentName: submission.studentName,
          previousSuggestedScore: submission.suggestedScore,
          suggestedScore: update.suggestedScore,
        })
      } catch (error) {
        results.push({
          submissionId: submission.id,
          studentName: submission.studentName,
          previousSuggestedScore: submission.suggestedScore,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const changed = results.filter(
      r => r.suggestedScore !== undefined && r.suggestedScore !== r.previousSuggestedScore
    ).length

    return NextResponse.json({
      total: results.length,
      rescored: results.filter(r => r.error === undefined).length,
      changed,
      failed: results.filter(r => r.error !== undefined).length,
      results,
    })
  } catch (error) {
    console.error('Error rescoring assignment:', error)
    return NextResponse.json({ error: 'Failed to rescore assignment' }, { status: 500 })
  }
}
