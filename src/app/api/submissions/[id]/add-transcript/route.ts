import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { smartParse, type ParsedChat } from '@/lib/parser/chatgpt'
import { DEFAULT_RUBRIC_CONFIG } from '@/lib/scorer/rubric'
import { scoreSubmission } from '@/lib/scorer/pipeline'
import type { RubricConfig } from '@/lib/db/schema'

// POST - Upgrade a 'code_only' submission to 'chat' once a transcript arrives; aiLikelihoodScore/Signals stay as historical context.
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

    if (submission.submissionMode !== 'code_only') {
      return NextResponse.json(
        { error: 'This submission already has a transcript' },
        { status: 409 }
      )
    }

    const body = await request.json()
    const { chatExports } = body

    if (!chatExports || chatExports.length === 0) {
      return NextResponse.json(
        { error: 'At least one chat export is required' },
        { status: 400 }
      )
    }

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

    const assignment = await db
      .select()
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId))
      .limit(1)

    if (assignment.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    const rubricConfig: RubricConfig = assignment[0].rubricConfig
      ? JSON.parse(assignment[0].rubricConfig)
      : DEFAULT_RUBRIC_CONFIG

    const scored = scoreSubmission(parsedChats, submission.finalCode, rubricConfig)

    const result = await db
      .update(submissions)
      .set({
        submissionMode: 'chat',
        chatExports: JSON.stringify(parsedChats),
        aiCodeSnippets: JSON.stringify(scored.aiCodeSnippets),
        computedMetrics: JSON.stringify(scored.metrics),
        suggestedScore: scored.suggestedScore,
        suggestedDimensionScores: JSON.stringify(scored.dimensionScores),
        rubricSnapshot: JSON.stringify(rubricConfig),
        transcriptStatus: 'received',
      })
      .where(eq(submissions.id, submissionId))
      .returning()

    return NextResponse.json(result[0])
  } catch (error) {
    console.error('Error adding transcript to submission:', error)
    return NextResponse.json({ error: 'Failed to add transcript' }, { status: 500 })
  }
}
