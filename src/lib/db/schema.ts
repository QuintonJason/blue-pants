import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// Teacher authentication (simple password-based)
export const teachers = sqliteTable('teachers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(new Date().toISOString()),
})

// Assignments
export const assignments = sqliteTable('assignments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: text('created_at').notNull().default(new Date().toISOString()),
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
  submittedAt: text('submitted_at').notNull().default(new Date().toISOString()),

  // Chat data
  chatExports: text('chat_exports').notNull(), // JSON array of parsed chats

  // Final code submission
  finalCode: text('final_code'),

  // Extracted code from AI responses (for diff comparison)
  aiCodeSnippets: text('ai_code_snippets'), // JSON array of code blocks

  // Computed metrics
  computedMetrics: text('computed_metrics'), // JSON object with all metrics

  // Scores
  suggestedScore: real('suggested_score'),
  finalScore: real('final_score'),

  // Per-dimension scores (JSON)
  dimensionScores: text('dimension_scores'),

  // Teacher notes
  teacherNotes: text('teacher_notes'),

  // Student self-reflection
  selfReflection: text('self_reflection'),
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
