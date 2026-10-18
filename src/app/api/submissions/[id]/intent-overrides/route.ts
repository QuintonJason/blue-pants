import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { assignments, submissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseAnchor, parseIntentOverrides, setRuling, type IntentKind } from '@/lib/analyzer/intent-overrides'
import { DEFAULT_RUBRIC_CONFIG, validateRubricConfig } from '@/lib/scorer/rubric'
import { rescoreStoredSubmission } from '@/lib/scorer/pipeline'
import { withEvidenceCheck } from '@/lib/scorer/evidence'
import type { ParsedChat } from '@/lib/parser/chatgpt'
import type { RubricConfig } from '@/lib/db/schema'

const KINDS: IntentKind[] = ['delegation', 'offTopic']

/**
 * POST - Rule on one flagged message: { anchor, kind, value }, where value says
 * whether it counts as that kind (a hand-off, or off-topic).
 *
 * The suggestion is recomputed with the ruling straight away, under the current
 * rules and rubric, so it never disagrees with what the teacher ruled. The
 * teacher's own grade and notes are left as they are.
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

    const { anchor, kind, value } = await request.json()
    const at = typeof anchor === 'string' ? parseAnchor(anchor) : null
    if (!at || !KINDS.includes(kind) || typeof value !== 'boolean') {
      return NextResponse.json(
        { error: 'Expected { anchor: "chat-N-message-N", kind: "delegation" | "offTopic", value: boolean }' },
        { status: 400 }
      )
    }

    const [submission] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1)
    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
    }
    if (submission.submissionMode !== 'chat' || !submission.chatExports) {
      return NextResponse.json({ error: 'This submission has no transcript to rule on' }, { status: 422 })
    }

    const chats: ParsedChat[] = JSON.parse(submission.chatExports)
    if (chats[at.chatIndex]?.messages[at.messageIndex]?.role !== 'user') {
      return NextResponse.json({ error: 'No student message at that anchor' }, { status: 422 })
    }

    const [assignment] = await db
      .select({ rubricConfig: assignments.rubricConfig })
      .from(assignments)
      .where(eq(assignments.id, submission.assignmentId))
      .limit(1)
    let rubricConfig: RubricConfig = DEFAULT_RUBRIC_CONFIG
    if (assignment?.rubricConfig) {
      const validated = validateRubricConfig(JSON.parse(assignment.rubricConfig))
      if (!validated.ok) {
        return NextResponse.json({ error: `Assignment rubric is invalid: ${validated.error}` }, { status: 409 })
      }
      rubricConfig = validated.value
    }

    const overrides = setRuling(chats, parseIntentOverrides(submission.intentOverrides), anchor, kind, value)
    const update = rescoreStoredSubmission(submission.chatExports, submission.finalCode, rubricConfig, overrides)

    const [result] = await db
      .update(submissions)
      .set({ ...update, intentOverrides: JSON.stringify(overrides) })
      .where(eq(submissions.id, submissionId))
      .returning()

    return NextResponse.json(withEvidenceCheck(result))
  } catch (error) {
    console.error('Error saving a ruling on a flagged message:', error)
    return NextResponse.json({ error: 'Failed to save the ruling' }, { status: 500 })
  }
}
