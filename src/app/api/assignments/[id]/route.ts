import { NextResponse } from 'next/server'
import { db, initializeDatabase } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

// GET - Get single assignment with submission count
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initializeDatabase()
    const { id } = await params
    const assignmentId = parseInt(id, 10)

    if (isNaN(assignmentId)) {
      return NextResponse.json(
        { error: 'Invalid assignment ID' },
        { status: 400 }
      )
    }

    const assignment = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .limit(1)

    if (assignment.length === 0) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      )
    }

    // Get submission count
    const submissionList = await db
      .select()
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId))

    return NextResponse.json({
      ...assignment[0],
      submissionCount: submissionList.length,
    })
  } catch (error) {
    console.error('Error fetching assignment:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assignment' },
      { status: 500 }
    )
  }
}

// PUT - Update assignment
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initializeDatabase()
    const { id } = await params
    const assignmentId = parseInt(id, 10)

    if (isNaN(assignmentId)) {
      return NextResponse.json(
        { error: 'Invalid assignment ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { name, description, rubricConfig } = body

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name.trim()
    if (description !== undefined) updateData.description = description?.trim() || null
    if (rubricConfig !== undefined) updateData.rubricConfig = JSON.stringify(rubricConfig)

    const result = await db
      .update(assignments)
      .set(updateData)
      .where(eq(assignments.id, assignmentId))
      .returning()

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Assignment not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error updating assignment:', error)
    return NextResponse.json(
      { error: 'Failed to update assignment' },
      { status: 500 }
    )
  }
}

// DELETE - Delete assignment
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    initializeDatabase()
    const { id } = await params
    const assignmentId = parseInt(id, 10)

    if (isNaN(assignmentId)) {
      return NextResponse.json(
        { error: 'Invalid assignment ID' },
        { status: 400 }
      )
    }

    await db.delete(assignments).where(eq(assignments.id, assignmentId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting assignment:', error)
    return NextResponse.json(
      { error: 'Failed to delete assignment' },
      { status: 500 }
    )
  }
}
