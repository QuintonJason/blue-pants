import { NextResponse } from 'next/server'
import { parseIntentOverrides } from '@/lib/analyzer/intent-overrides'
import { db } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { DEFAULT_RUBRIC_CONFIG, validateRubricConfig } from '@/lib/scorer/rubric'
import { rescoreStoredSubmission, rescoreCodeOnlySubmission } from '@/lib/scorer/pipeline'
import type { RubricConfig } from '@/lib/db/schema'

/**
 * POST - Recompute one submission's suggested score from its stored transcripts.
 *
 * Only derived fields change. A grade the teacher entered by hand (finalScore,
 * teacherNotes) and the student's reflection are left exactly as they are.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const submissionId = parseInt(id, 10)

    if (isNaN(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission ID' }, { status: 400 })
    }

    const existing = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1)

    if (existing.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    const submission = existing[0]

    const assignment = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId))
      .limit(1)

    if (assignment.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // A code_only submission has no transcript to score against — it gets the code-based heuristic instead.
    if (submission.submissionMode === 'code_only') {
      const update = rescoreCodeOnlySubmission(submission.finalCode, assignment[0].curriculumScope)
      const result = await db
        .update(submissions)
        .set(update)
        .where(eq(submissions.id, submissionId))
        .returning()

      return NextResponse.json({
        submission: result[0],
        previousAiLikelihoodScore: submission.aiLikelihoodScore,
        aiLikelihoodScore: update.aiLikelihoodScore,
      })
    }

    // Score against the assignment's current rubric, which is what the report shows.
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

    if (!submission.chatExports) {
      return NextResponse.json(
        { error: 'This submission has no stored transcript to rescore' },
        { status: 422 }
      )
    }

    let update
    try {
      update = rescoreStoredSubmission(
        submission.chatExports,
        submission.finalCode,
        rubricConfig,
        parseIntentOverrides(submission.intentOverrides)
      )
    } catch (error) {
      return NextResponse.json(
        {
          error: `Could not read stored transcripts: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        },
        { status: 422 }
      )
    }

    const result = await db
      .update(submissions)
      .set(update)
      .where(eq(submissions.id, submissionId))
      .returning()

    return NextResponse.json({
      submission: result[0],
      previousSuggestedScore: submission.suggestedScore,
      suggestedScore: update.suggestedScore,
    })
  } catch (error) {
    console.error('Error rescoring submission:', error)
    return NextResponse.json({ error: 'Failed to rescore submission' }, { status: 500 })
  }
}
