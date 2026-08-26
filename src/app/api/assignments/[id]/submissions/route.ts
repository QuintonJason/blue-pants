import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { submissions, assignments } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { smartParse, type ParsedChat } from '@/lib/parser/chatgpt'
import { DEFAULT_RUBRIC_CONFIG } from '@/lib/scorer/rubric'
import { scoreSubmission } from '@/lib/scorer/pipeline'
import type { RubricConfig } from '@/lib/db/schema'

// GET - List submissions for an assignment
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const assignmentId = parseInt(id, 10)

    if (isNaN(assignmentId)) {
      return NextResponse.json(
        { error: 'Invalid assignment ID' },
        { status: 400 }
      )
    }

    const submissionList = await db
      .select()
      .from(submissions)
      .where(eq(submissions.assignmentId, assignmentId))
      .orderBy(desc(submissions.submittedAt))

    return NextResponse.json(submissionList)
  } catch (error) {
    console.error('Error fetching submissions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch submissions' },
      { status: 500 }
    )
  }
}

// POST - Create new submission
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const assignmentId = parseInt(id, 10)

    if (isNaN(assignmentId)) {
      return NextResponse.json(
        { error: 'Invalid assignment ID' },
        { status: 400 }
      )
    }

    // Get assignment for rubric config
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

    const rubricConfig: RubricConfig = assignment[0].rubricConfig
      ? JSON.parse(assignment[0].rubricConfig)
      : DEFAULT_RUBRIC_CONFIG

    const body = await request.json()
    const { studentName, chatExports, finalCode } = body

    if (!studentName || studentName.trim().length === 0) {
      return NextResponse.json(
        { error: 'Student name is required' },
        { status: 400 }
      )
    }

    if (!chatExports || chatExports.length === 0) {
      return NextResponse.json(
        { error: 'At least one chat export is required' },
        { status: 400 }
      )
    }

    // Parse all chat exports
    const parsedChats: ParsedChat[] = chatExports.flatMap((chatJson: string) => {
      try {
        return smartParse(chatJson)
      } catch (e) {
        console.error('Error parsing chat:', e)
        return []
      }
    })

    if (parsedChats.length === 0) {
      return NextResponse.json(
        { error: 'Could not parse any chat exports' },
        { status: 400 }
      )
    }

    const scored = scoreSubmission(parsedChats, finalCode, rubricConfig)

    // Insert submission
    const result = await db.insert(submissions).values({
      assignmentId,
      studentName: studentName.trim(),
      submittedAt: new Date().toISOString(),
      chatExports: JSON.stringify(parsedChats),
      finalCode: finalCode || null,
      aiCodeSnippets: JSON.stringify(scored.aiCodeSnippets),
      computedMetrics: JSON.stringify(scored.metrics),
      suggestedScore: scored.suggestedScore,
      suggestedDimensionScores: JSON.stringify(scored.dimensionScores),
    }).returning()

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error creating submission:', error)
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    )
  }
}
