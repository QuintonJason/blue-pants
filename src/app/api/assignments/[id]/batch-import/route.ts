import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { submissions, assignments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { smartParse } from '@/lib/parser/chatgpt'
import { DEFAULT_RUBRIC_CONFIG } from '@/lib/scorer/rubric'
import { scoreSubmission, TRANSCRIPT_SCORER_VERSION } from '@/lib/scorer/pipeline'
import type { RubricConfig } from '@/lib/db/schema'

interface SubmissionInput {
  studentName: string
  chatExports: string[]
  finalCode?: string | null
}

interface ImportResult {
  studentName: string
  success: boolean
  submissionId?: number
  error?: string
}

// POST - Batch import multiple submissions
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
    const { submissions: submissionInputs } = body as { submissions: SubmissionInput[] }

    if (!Array.isArray(submissionInputs) || submissionInputs.length === 0) {
      return NextResponse.json(
        { error: 'At least one submission is required' },
        { status: 400 }
      )
    }

    const results: ImportResult[] = []
    let successCount = 0
    let failedCount = 0

    // Process each submission
    for (const input of submissionInputs) {
      const { studentName, chatExports, finalCode } = input

      try {
        // Validate input
        if (!studentName || studentName.trim().length === 0) {
          throw new Error('Student name is required')
        }

        if (!chatExports || chatExports.length === 0) {
          throw new Error('At least one chat export is required')
        }

        // Parse all chat exports
        const parsedChats = chatExports.flatMap((chatJson: string) => {
          try {
            return smartParse(chatJson)
          } catch (e) {
            console.error('Error parsing chat:', e)
            return []
          }
        })

        if (parsedChats.length === 0) {
          throw new Error('Could not parse any chat exports')
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
          rubricSnapshot: JSON.stringify(rubricConfig),
          transcriptScorerVersion: TRANSCRIPT_SCORER_VERSION,
          aiUseFindings: JSON.stringify(scored.aiUseFindings),
        }).returning()

        results.push({
          studentName,
          success: true,
          submissionId: result[0].id,
        })
        successCount++
      } catch (error) {
        results.push({
          studentName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        failedCount++
      }
    }

    return NextResponse.json({
      success: successCount,
      failed: failedCount,
      total: submissionInputs.length,
      results,
    })
  } catch (error) {
    console.error('Error in batch import:', error)
    return NextResponse.json(
      { error: 'Failed to process batch import' },
      { status: 500 }
    )
  }
}
