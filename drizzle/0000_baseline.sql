CREATE TABLE `assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`rubric_config` text DEFAULT '{"problemArticulation":20,"iterationQuality":20,"criticalEvaluation":20,"codeReviewEngagement":20,"debuggingProcess":10,"independenceShown":10}' NOT NULL,
	`curriculum_scope` text
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`student_name` text NOT NULL,
	`submitted_at` text NOT NULL,
	`chat_exports` text,
	`final_code` text,
	`ai_code_snippets` text,
	`computed_metrics` text,
	`suggested_score` real,
	`final_score` real,
	`dimension_scores` text,
	`teacher_notes` text,
	`self_reflection` text,
	`suggested_dimension_scores` text,
	`rubric_snapshot` text,
	`submission_mode` text DEFAULT 'chat' NOT NULL,
	`ai_likelihood_score` real,
	`ai_likelihood_signals` text,
	`ai_likelihood_scorer_version` text,
	`transcript_status` text,
	`transcript_requested_at` text,
	`curriculum_scope_flags` text,
	`transcript_scorer_version` text,
	`ai_use_findings` text,
	`grade_records` text,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` text NOT NULL
);
