// Flags techniques in a submission's code that the course calendar hasn't taught yet as of a
// given assignment's due date. Unlike code-smell.ts (generic text/style heuristics), every
// flag here is a falsifiable claim tied to a specific syllabus week — "this is Week 7 material"
// is something anyone can check against the calendar, which is exactly why it survives scrutiny
// that a stylistic heuristic doesn't. Still informational only: corroborating evidence for a
// conversation with the student, never the content grade (see analyzer/code-smell.ts).

import type { CurriculumScopeFlag } from '../db/schema'

interface TechniqueDefinition {
  id: string
  label: string
  pattern: RegExp
}

/**
 * A general-purpose library covering topics named in a typical intro web-dev
 * calendar (box model, positioning, flexbox/grid, transitions/transforms/
 * animations, responsive/media queries, custom properties, structural
 * pseudo-classes, basic DOM/JS). Reusable across assignments and semesters —
 * what's "in scope" for any one assignment is just which IDs the teacher checks
 * off in that assignment's settings.
 */
export const TECHNIQUE_LIBRARY: TechniqueDefinition[] = [
  { id: 'css-hover', label: ':hover', pattern: /:hover\b/ },
  { id: 'css-structural-pseudo', label: ':first-child / :last-child / :nth-child', pattern: /:(first|last|nth|only)-child\b|:nth-of-type\b/ },
  { id: 'css-box-sizing', label: 'box-sizing (CSS Box Model)', pattern: /\bbox-sizing\s*:/i },
  { id: 'css-positioning', label: 'position: sticky/absolute/fixed + z-index (CSS Positioning)', pattern: /\bposition\s*:\s*(sticky|absolute|fixed|relative)\b|\bz-index\s*:/i },
  { id: 'css-flexbox', label: 'Flexbox (display: flex, flex-wrap, gap, justify/align)', pattern: /\bdisplay\s*:\s*flex\b|\bflex-wrap\s*:|\bjustify-content\s*:|\balign-items\s*:|\bgap\s*:/i },
  { id: 'css-grid', label: 'CSS Grid', pattern: /\bdisplay\s*:\s*grid\b|\bgrid-template/i },
  { id: 'css-media-queries', label: '@media / responsive breakpoints', pattern: /@media\b/i },
  { id: 'css-transforms', label: 'CSS Transforms (transform:, filter:)', pattern: /\btransform\s*:|\bfilter\s*:/i },
  { id: 'css-transitions', label: 'CSS Transitions', pattern: /\btransition\s*:/i },
  { id: 'css-animations', label: 'CSS Animations (@keyframes, animation:)', pattern: /@keyframes\b|\banimation\s*:/i },
  { id: 'css-custom-properties', label: 'CSS custom properties (:root { --x }, var(--x))', pattern: /:root\s*{[^}]*--[\w-]+\s*:|var\(--[\w-]+\)/ },
  { id: 'js-dom-query', label: 'JS DOM queries (querySelector/getElementById)', pattern: /document\.(querySelector|getElementById)\b/ },
  { id: 'js-event-handling', label: 'JS event handling (addEventListener)', pattern: /\baddEventListener\s*\(/ },
]

/** Shape stored in assignments.curriculumScope. */
export interface CurriculumScopeConfig {
  taughtTechniqueIds: string[]
  weekByTechnique?: Record<string, number>
}

export type CurriculumScopeValidation =
  | { ok: true; value: CurriculumScopeConfig }
  | { ok: false; error: string }

export function validateCurriculumScope(input: unknown): CurriculumScopeValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Curriculum scope must be an object' }
  }
  const record = input as Record<string, unknown>

  const taughtTechniqueIds = record.taughtTechniqueIds
  if (!Array.isArray(taughtTechniqueIds) || !taughtTechniqueIds.every(id => typeof id === 'string')) {
    return { ok: false, error: 'taughtTechniqueIds must be an array of strings' }
  }
  const validIds = new Set(TECHNIQUE_LIBRARY.map(t => t.id))
  const unrecognized = taughtTechniqueIds.filter(id => !validIds.has(id))
  if (unrecognized.length > 0) {
    return { ok: false, error: `Unknown technique id(s): ${unrecognized.join(', ')}` }
  }

  let weekByTechnique: Record<string, number> | undefined
  if (record.weekByTechnique !== undefined) {
    if (typeof record.weekByTechnique !== 'object' || record.weekByTechnique === null || Array.isArray(record.weekByTechnique)) {
      return { ok: false, error: 'weekByTechnique must be an object' }
    }
    for (const [id, week] of Object.entries(record.weekByTechnique)) {
      if (typeof week !== 'number' || !Number.isFinite(week)) {
        return { ok: false, error: `weekByTechnique.${id} must be a finite number` }
      }
    }
    weekByTechnique = record.weekByTechnique as Record<string, number>
  }

  return { ok: true, value: { taughtTechniqueIds, weekByTechnique } }
}

/**
 * Which technique IDs actually appear in this code, regardless of scope — used by
 * the assignment-settings checklist so a teacher can see what a piece of sample
 * code touches without having to memorize the library.
 */
export function detectTechniques(code: string): string[] {
  return TECHNIQUE_LIBRARY.filter(t => t.pattern.test(code)).map(t => t.id)
}

/**
 * Flag techniques present in `code` that are not in `taughtTechniqueIds`.
 * `taughtTechniqueIds` should hold the technique IDs the teacher has marked as
 * covered by this specific assignment's due date (assignments.curriculumScope).
 * `weekByTechnique` is an optional, course-specific "which week is this actually
 * taught" citation the teacher can supply — the library itself stays course-
 * agnostic, since two courses can teach the same technique in different weeks.
 */
export function checkCurriculumScope(
  code: string,
  taughtTechniqueIds: string[],
  weekByTechnique?: Record<string, number>
): CurriculumScopeFlag[] {
  const taught = new Set(taughtTechniqueIds)

  return TECHNIQUE_LIBRARY.filter(t => !taught.has(t.id) && t.pattern.test(code)).map(t => {
    const match = t.pattern.exec(code)
    return {
      id: t.id,
      label: t.label,
      syllabusWeek: weekByTechnique?.[t.id] ?? null,
      evidence: match ? [match[0]] : [],
    }
  })
}
