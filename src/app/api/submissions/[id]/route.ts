import { NextResponse } from 'next/server'
import { db, initializeDatabase } from '@/lib/db'
import { submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// GET - Get single submission
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initializeDatabase()
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
    initializeDatabase()
    const { id } = await params
    const submissionId = parseInt(id, 10)

    if (isNaN(submissionId)) {
      return NextResponse.json(
        { error: 'Invalid submission ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { finalScore, dimensionScores, teacherNotes, selfReflection } = body

    const updateData: Record<string, unknown> = {}
    if (finalScore !== undefined) updateData.finalScore = finalScore
    if (dimensionScores !== undefined) updateData.dimensionScores = JSON.stringify(dimensionScores)
    if (teacherNotes !== undefined) updateData.teacherNotes = teacherNotes
    if (selfReflection !== undefined) updateData.selfReflection = selfReflection

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
    initializeDatabase()
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
