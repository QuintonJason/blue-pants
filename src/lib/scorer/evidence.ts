/**
 * Evidence fingerprints
 *
 * Server-only (node crypto), kept apart from grade-record.ts, which the page
 * imports too. A grade record stores the fingerprint of the transcript and code
 * it was given on; comparing it with the stored evidence today shows whether
 * either has been replaced or edited since, by any route or by hand.
 */

import { createHash } from 'crypto'
import type { Submission } from '../db/schema'
import { parseGradeRecords, type EvidenceFingerprint } from './grade-record'
import { parseIntentOverrides } from '../analyzer/intent-overrides'

type Evidence = Pick<Submission, 'chatExports' | 'finalCode'>

export function evidenceFingerprint(submission: Evidence): EvidenceFingerprint {
  return { chatSha256: sha256(submission.chatExports), codeSha256: sha256(submission.finalCode) }
}

/**
 * Whether the transcript or code differs from what the current grade was given
 * on. False when there's no grade record, or it predates fingerprints.
 */
export function evidenceChangedSinceGrade(submission: Evidence & Pick<Submission, 'gradeRecords'>): boolean {
  const recorded = parseGradeRecords(submission.gradeRecords).at(-1)?.evidence
  if (!recorded) return false
  const current = evidenceFingerprint(submission)
  return recorded.chatSha256 !== current.chatSha256 || recorded.codeSha256 !== current.codeSha256
}

/**
 * Whether the teacher's rulings on flagged messages differ from those the current
 * grade was recorded with. False when there's no record, or it predates rulings.
 */
export function rulingsChangedSinceGrade(submission: Pick<Submission, 'gradeRecords' | 'intentOverrides'>): boolean {
  const recorded = parseGradeRecords(submission.gradeRecords).at(-1)?.intentOverrides
  if (!recorded) return false
  return JSON.stringify(recorded) !== JSON.stringify(parseIntentOverrides(submission.intentOverrides))
}

/** A submission row as the API returns it: with the checks against its grade record, which the client can't compute. */
export function withEvidenceCheck<T extends Submission>(
  submission: T
): T & { evidenceChangedSinceGrade: boolean; rulingsChangedSinceGrade: boolean } {
  return {
    ...submission,
    evidenceChangedSinceGrade: evidenceChangedSinceGrade(submission),
    rulingsChangedSinceGrade: rulingsChangedSinceGrade(submission),
  }
}

function sha256(stored: string | null): string | null {
  return stored === null ? null : createHash('sha256').update(stored).digest('hex')
}
