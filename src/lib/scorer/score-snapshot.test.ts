/**
 * Scores must not move without a scoring-rules version bump.
 *
 * TRANSCRIPT_SCORER_VERSION is stored with every suggestion and grade record and
 * is what flags a score as outdated, so a change that moves scores without
 * bumping it leaves old and new scores looking alike. This scores fixed
 * transcripts (samples and made-up ones, no student data) and compares them with
 * score-snapshot.json, which records the version they were scored under.
 *
 * After a deliberate change: bump TRANSCRIPT_SCORER_VERSION, then run
 * `npm run test:update-scores` and review the snapshot diff.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { smartParse } from '../parser/chatgpt'
import { scoreSubmission, TRANSCRIPT_SCORER_VERSION } from './pipeline'
import { DEFAULT_RUBRIC_CONFIG } from './rubric'

const SNAPSHOT = path.join(__dirname, 'score-snapshot.json')
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
const simple = (messages: Array<[ 'user' | 'assistant', string ]>) =>
  JSON.stringify({ title: 'Fixture', messages: messages.map(([role, content]) => ({ role, content })) })

const PAGE_CODE = Array.from({ length: 20 }, (_, i) => `<p class="line-${i}">Line ${i}</p>`).join('\n')

const FIXTURES: Record<string, { chat: string; code: string | null }> = {
  'docs sample': { chat: read('docs/sample-chatgpt-export.json'), code: read('docs/sample-final-code.html') },
  'docs test': { chat: read('docs/test-chat-export.json'), code: read('docs/test-final-code.html') },
  'hands off the work': {
    chat: simple([
      ['user', 'Design my club website using separate HTML, CSS, and JavaScript files'],
      ['assistant', '```html\n' + PAGE_CODE + '\n```'],
      ['user', 'give me all the code so i can copy and paste'],
      ['assistant', '```html\n' + PAGE_CODE + '\n```'],
      ['user', 'give this image a transparent background'],
      ['assistant', 'Done.'],
    ]),
    code: PAGE_CODE,
  },
  'asks and debugs': {
    chat: simple([
      ['user', 'is head different from header in html? I am making a page for my cat club and want the title in the tab'],
      ['assistant', 'Yes. <head> holds metadata like <title>; <header> is visible content.'],
      ['user', "my nav links aren't centered, I tried text-align: center on nav ul but nothing changed. why?"],
      ['assistant', 'Use display: flex and justify-content: center on the ul.'],
      ['user', 'that worked, but why did text-align not work on the li elements?'],
      ['assistant', 'They were block-level list items; text-align centers inline content inside them.'],
      ['user', 'can you review my css and tell me what I could improve?\n```css\nnav ul { display: flex; justify-content: center; }\n```'],
      ['assistant', 'Looks good. Consider a gap property for spacing.'],
    ]),
    code: '<nav><ul><li>Home</li></ul></nav>\n<style>nav ul { display: flex; justify-content: center; gap: 1rem; }</style>',
  },
}

function scoreFixtures() {
  return Object.fromEntries(
    Object.entries(FIXTURES).map(([name, { chat, code }]) => {
      const scored = scoreSubmission(smartParse(chat), code, DEFAULT_RUBRIC_CONFIG)
      return [
        name,
        {
          suggestedScore: scored.suggestedScore,
          dimensionScores: scored.dimensionScores,
          delegationCount: scored.metrics.delegationCount,
          offTopicCount: scored.metrics.offTopicCount,
          aiUseFindings: scored.aiUseFindings,
        },
      ]
    })
  )
}

describe('score snapshot', () => {
  it('only moves when TRANSCRIPT_SCORER_VERSION is bumped', () => {
    const scores = scoreFixtures()
    const snapshot = fs.existsSync(SNAPSHOT) ? JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) : null

    if (process.env.UPDATE_SCORE_SNAPSHOT) {
      const moved = JSON.stringify(snapshot?.scores) !== JSON.stringify(scores)
      if (snapshot?.scorerVersion === TRANSCRIPT_SCORER_VERSION && moved) {
        throw new Error('Scores moved: bump TRANSCRIPT_SCORER_VERSION in pipeline.ts before updating the snapshot.')
      }
      fs.writeFileSync(SNAPSHOT, JSON.stringify({ scorerVersion: TRANSCRIPT_SCORER_VERSION, scores }, null, 2) + '\n')
      return
    }

    expect(snapshot, 'No score snapshot: run `npm run test:update-scores`').not.toBeNull()
    expect(
      snapshot.scorerVersion,
      'TRANSCRIPT_SCORER_VERSION changed: run `npm run test:update-scores` and review the snapshot diff'
    ).toBe(TRANSCRIPT_SCORER_VERSION)
    expect(
      scores,
      'Scores moved without a version bump: bump TRANSCRIPT_SCORER_VERSION in pipeline.ts, then run `npm run test:update-scores`'
    ).toEqual(snapshot.scores)
  })
})
