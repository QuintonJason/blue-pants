import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { assignments } from '@/lib/db/schema'
import { desc } from 'drizzle-orm'
import { validateRubricConfig } from '@/lib/scorer/rubric'

// GET - List all assignments
export async function GET() {
  try {
    const allAssignments = await db
      .select()
      .from(assignments)
      .orderBy(desc(assignments.createdAt))

    return NextResponse.json(allAssignments)
  } catch (error) {
    console.error('Error fetching assignments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch assignments' },
      { status: 500 }
    )
  }
}

// POST - Create new assignment
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, rubricConfig } = body

    if (!name || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Assignment name is required' },
        { status: 400 }
      )
    }

    let rubricConfigJson: string | undefined = undefined
    if (rubricConfig !== undefined) {
      const validated = validateRubricConfig(rubricConfig)
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 })
      }
      rubricConfigJson = JSON.stringify(validated.value)
    }

    const result = await db.insert(assignments).values({
      name: name.trim(),
      description: description?.trim() || null,
      rubricConfig: rubricConfigJson,
      createdAt: new Date().toISOString(),
    }).returning()

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error creating assignment:', error)
    return NextResponse.json(
      { error: 'Failed to create assignment' },
      { status: 500 }
    )
  }
}
