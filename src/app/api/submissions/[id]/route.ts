import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// GET - Get single submission
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const submissionId = parseInt(id, 10)

    if (isNaN(submissionId)) {
      return NextResponse.json(
        { error: 'Invalid submission ID' },
        { status: 400 }
      )
    }

    const submission = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1)

    if (submission.length === 0) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(submission[0])
  } catch (error) {
    console.error('Error fetching submission:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submission' },
      { status: 500 }
    )
  }
}

// PUT - Update submission (for scoring)
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const submissionId = parseInt(id, 10)

    if (isNaN(submissionId)) {
      return NextResponse.json(
        { error: 'Invalid submission ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { finalScore, dimensionScores, teacherNotes, selfReflection, transcriptStatus } = body

    // A code_only submission has no rubric backing a grade — require the teacher to
    // write down why, so a grade can never be entered with zero paper trail.
    if (finalScore !== undefined) {
      const existing = await db
        .select({ submissionMode: submissions.submissionMode, teacherNotes: submissions.teacherNotes })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .limit(1)

      if (existing.length === 0) {
        return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
      }

      const effectiveNotes = teacherNotes !== undefined ? teacherNotes : existing[0].teacherNotes
      if (existing[0].submissionMode === 'code_only' && !effectiveNotes?.trim()) {
        return NextResponse.json(
          { error: 'Teacher notes are required to save a grade on a submission with no transcript' },
          { status: 400 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (finalScore !== undefined) updateData.finalScore = finalScore
    if (dimensionScores !== undefined) updateData.dimensionScores = JSON.stringify(dimensionScores)
    if (teacherNotes !== undefined) updateData.teacherNotes = teacherNotes
    if (selfReflection !== undefined) updateData.selfReflection = selfReflection
    // 'received' is only ever set by POST /add-transcript, which does the actual upgrade work.
    if (transcriptStatus === 'requested') {
      updateData.transcriptStatus = 'requested'
      updateData.transcriptRequestedAt = new Date().toISOString()
    }

    const result = await db
      .update(submissions)
      .set(updateData)
      .where(eq(submissions.id, submissionId))
      .returning()

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Submission not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error updating submission:', error)
    return NextResponse.json(
      { error: 'Failed to update submission' },
      { status: 500 }
    )
  }
}

// DELETE - Delete submission
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const submissionId = parseInt(id, 10)

    if (isNaN(submissionId)) {
      return NextResponse.json(
        { error: 'Invalid submission ID' },
        { status: 400 }
      )
    }

    await db.delete(submissions).where(eq(submissions.id, submissionId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting submission:', error)
    return NextResponse.json(
      { error: 'Failed to delete submission' },
      { status: 500 }
    )
  }
}
