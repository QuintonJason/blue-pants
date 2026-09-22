import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// Teacher authentication (simple password-based)
export const teachers = sqliteTable('teachers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
})

// Assignments
export const assignments = sqliteTable('assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  // Rubric weights stored as JSON
  rubricConfig: text('rubric_config').notNull().default(JSON.stringify({
    problemArticulation: 20,
    iterationQuality: 20,
    criticalEvaluation: 20,
    codeReviewEngagement: 20,
    debuggingProcess: 10,
    independenceShown: 10,
  })),
})

// Submissions
export const submissions = sqliteTable('submissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  assignmentId: integer('assignment_id').notNull().references(() => assignments.id, { onDelete: 'cascade' }),
  studentName: text('student_name').notNull(),
  submittedAt: text('submitted_at').notNull().$defaultFn(() => new Date().toISOString()),

  // Chat data. Null for a 'code_only' submission — no transcript was offered or required.
  chatExports: text('chat_exports'), // JSON array of parsed chats

  // Final code submission
  finalCode: text('final_code'),

  // Extracted code from AI responses (for diff comparison)
  aiCodeSnippets: text('ai_code_snippets'), // JSON array of code blocks

  // Computed metrics
  computedMetrics: text('computed_metrics'), // JSON object with all metrics

  // Scores
  suggestedScore: real('suggested_score'),
  finalScore: real('final_score'),

  // Per-dimension scores as adjusted by the teacher (JSON). Null until they save.
  // Kept separate from the suggestion so recomputing cannot overwrite their work.
  dimensionScores: text('dimension_scores'),

  // Teacher notes
  teacherNotes: text('teacher_notes'),

  // Student self-reflection
  selfReflection: text('self_reflection'),

  // Per-dimension scores as suggested by the scorer (JSON, derived — a rescore
  // recomputes this). Declared late: SQLite can only append columns, so
  // drizzle-kit push rebuilds the whole table if a new one appears mid-definition.
  suggestedDimensionScores: text('suggested_dimension_scores'),

  // The rubric weights the suggested score was computed with (JSON). Assignment
  // rubrics are editable, so without this a stored score cannot be explained: the
  // report would show old scores beside new weights with no way to tell.
  rubricSnapshot: text('rubric_snapshot'),

  // 'chat' (scored against the collaboration rubric) or 'code_only' (no transcript exists yet, scored by aiLikelihoodScore instead).
  submissionMode: text('submission_mode').notNull().default('chat'),

  // Code-only path: heuristic 0-100 estimate of AI-generated-code resemblance — evidence for a human call, never shown as a grade.
  aiLikelihoodScore: real('ai_likelihood_score'),
  aiLikelihoodSignals: text('ai_likelihood_signals'), // JSON array of CodeSmellSignalResult
  // The CODE_SMELL_SCORER_VERSION the score above was computed with, so a later rule change can't make it inexplicable (mirrors rubricSnapshot).
  aiLikelihoodScorerVersion: text('ai_likelihood_scorer_version'),

  // null (not asked), 'requested', or 'received' (upgraded this submission to submissionMode 'chat').
  transcriptStatus: text('transcript_status'),
  transcriptRequestedAt: text('transcript_requested_at'),
})

// Types for TypeScript
export type Teacher = typeof teachers.$inferSelect
export type NewTeacher = typeof teachers.$inferInsert

export type Assignment = typeof assignments.$inferSelect
export type NewAssignment = typeof assignments.$inferInsert

export type Submission = typeof submissions.$inferSelect
export type NewSubmission = typeof submissions.$inferInsert

// Rubric configuration type
export interface RubricConfig {
  problemArticulation: number
  iterationQuality: number
  criticalEvaluation: number
  codeReviewEngagement: number
  debuggingProcess: number
  independenceShown: number
}

// Computed metrics type
export interface ComputedMetrics {
  totalMessages: number
  userMessages: number
  assistantMessages: number
  averagePromptLength: number
  questionCount: number
  codeBlockCount: number
  userCodeBlocks: number
  errorMentions: number
  iterationCount: number
  shortPromptCount: number
  longPromptCount: number
}

// Dimension scores type
export interface DimensionScores {
  problemArticulation: number
  iterationQuality: number
  criticalEvaluation: number
  codeReviewEngagement: number
  debuggingProcess: number
  independenceShown: number
}

// One code-smell signal's result for a code_only submission (see analyzer/code-smell.ts)
export interface CodeSmellSignalResult {
  id: string
  label: string
  points: number
  maxPoints: number
  triggered: boolean
  evidence: string[]
}

export type SubmissionMode = 'chat' | 'code_only'
export type TranscriptStatus = 'requested' | 'received' | null
