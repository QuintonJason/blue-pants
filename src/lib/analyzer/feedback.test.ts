import { describe, it, expect } from 'vitest'
import { buildAiUseFeedback, classPatterns, feedbackToText, summarizeFindings, topFinding } from './feedback'
import { chat, message } from './fixtures'
import { messageAnchor } from './highlighter'

const SITE = Array.from({ length: 20 }, (_, i) => `<section class="part-${i}"><h2>Part ${i}</h2></section>`).join('\n')
const PASTE = Array.from({ length: 6 }, (_, i) => `<p class="note-${i}">Note ${i}</p>`).join('\n')

const titles = (points: { title: string }[]) => points.map(p => p.title)
const texts = (quotes: { text: string }[] = []) => quotes.map(q => q.text)

describe('buildAiUseFeedback', () => {
  const engaged = chat(
    message('user', 'is head different from header'),
    message('assistant', 'Yes: head holds metadata.'),
    message('user', 'does css apply to all pages automatically'),
    message('assistant', 'Only pages that link it.'),
    message('user', 'when to add a .. in front of a href'),
    message('assistant', 'When the file is one folder up.'),
    message('user', 'why isnt the background showing up?'),
    message('assistant', 'Check the path.'),
    message('user', 'its not disappearing'),
    message('assistant', 'Add the hidden attribute.'),
    message('user', `do i keep this?\n${PASTE}`),
    message('assistant', 'Keep the first two.'),
  )

  it('credits questions, debugging and review, quoting the student', () => {
    const feedback = buildAiUseFeedback([engaged], null)
    expect(titles(feedback.strengths)).toEqual([
      'You ask questions to understand, not just to get code',
      'You work through bugs by describing what went wrong',
      'You ask the AI to check code you already have',
    ])
    expect(texts(feedback.strengths[0].examples)).toContain('is head different from header')
    expect(texts(feedback.strengths[2].examples)).toEqual(['do i keep this?'])
    expect(feedback.improvements).toEqual([])
  })

  it('flags hand-offs and a final submission that is mostly the AI\'s code', () => {
    const handedOff = chat(
      message('user', 'Design my website with separate HTML and CSS files'),
      message('assistant', '```html\n' + SITE + '\n```'),
      message('user', 'make the units consistent in my css'),
      message('assistant', 'Here: [main.css](sandbox:/mnt/data/main.css)'),
    )
    const feedback = buildAiUseFeedback([handedOff], SITE)
    expect(titles(feedback.improvements)).toEqual(
      expect.arrayContaining([
        'Write features yourself before asking the AI to build them',
        "Make the AI's code your own",
        'Avoid taking whole files from the AI',
      ])
    )
    expect(feedback.improvements[0].examples[0].text).toMatch(/^Design my website/)
  })

  it('asks for context when code is pasted with only a few words', () => {
    const bare = chat(
      ...['why isnt this working', 'this one isnt working', 'is this fine?'].flatMap(words => [
        message('user', `${words}\n${PASTE}`),
        message('assistant', 'Close the tag.'),
      ])
    )
    const point = buildAiUseFeedback([bare], null).improvements.find(p => p.title.startsWith('Say what you expected'))
    expect(texts(point?.examples)).toEqual(['why isnt this working', 'this one isnt working', 'is this fine?'])
  })

  it('never quotes the same message for two points', () => {
    const feedback = buildAiUseFeedback([engaged], null)
    const quotes = texts([...feedback.strengths, ...feedback.improvements].flatMap(p => p.examples))
    expect(new Set(quotes).size).toBe(quotes.length)
  })

  it('links each quote to the message it came from', () => {
    const second = chat(message('user', 'unrelated'), message('assistant', 'ok'), ...engaged.messages)
    const feedback = buildAiUseFeedback([engaged, second], null)
    const review = feedback.strengths.find(p => p.title.startsWith('You ask the AI to check'))!
    // "do i keep this?" is the 11th message of the first chat.
    expect(review.examples[0].anchor).toBe(messageAnchor(0, 10))
  })

  it('notes off-topic requests without counting them', () => {
    const withImages = chat(
      ...engaged.messages,
      message('user', '[image] make these images transparent'),
      message('assistant', 'Done.'),
    )
    const feedback = buildAiUseFeedback([withImages], null)
    expect(feedback.notes[0]).toMatch(/^1 request was about something other than the code/)
  })
})

describe('feedbackToText', () => {
  it('renders both sections with quotes for pasting into feedback', () => {
    const text = feedbackToText({
      strengths: [{ id: 'asks-questions', count: 1, title: 'You ask questions', detail: 'Often.', examples: [{ text: 'why does this work', anchor: 'chat-0-message-0' }] }],
      improvements: [{ id: 'hands-off-features', count: 1, title: 'Write it yourself', detail: 'Sometimes.', examples: [] }],
      notes: ['1 request was off-topic.'],
    })
    expect(text).toBe(
      'What you are doing well\n- You ask questions. Often.\n    "why does this work"\n\n' +
        'What to work on\n- Write it yourself. Sometimes.\n\n1 request was off-topic.'
    )
  })
})

describe('classPatterns', () => {
  const findings = (improvements: string[], strengths: string[] = []) =>
    JSON.stringify({
      improvements: improvements.map(id => ({ id, count: 1 })),
      strengths: strengths.map(id => ({ id, count: 1 })),
    })

  it('counts students per finding, most common first', () => {
    const patterns = classPatterns([
      { studentName: 'Ana', submissionMode: 'chat', aiUseFindings: findings(['bare-pastes'], ['asks-questions']) },
      { studentName: 'Ben', submissionMode: 'chat', aiUseFindings: findings(['hands-off-features', 'bare-pastes']) },
      { studentName: 'Cy', submissionMode: 'chat', aiUseFindings: findings(['bare-pastes'], ['asks-questions']) },
    ])
    expect(patterns.analyzed).toBe(3)
    expect(patterns.improvements).toEqual([
      { id: 'bare-pastes', students: ['Ana', 'Ben', 'Cy'] },
      { id: 'hands-off-features', students: ['Ben'] },
    ])
    expect(patterns.strengths).toEqual([{ id: 'asks-questions', students: ['Ana', 'Cy'] }])
  })

  it('counts chat submissions without stored findings separately, and skips code-only ones', () => {
    const patterns = classPatterns([
      { studentName: 'Ana', submissionMode: 'chat', aiUseFindings: null },
      { studentName: 'Ben', submissionMode: 'chat', aiUseFindings: 'not json' },
      { studentName: 'Cy', submissionMode: 'code_only', aiUseFindings: null },
    ])
    expect(patterns).toEqual({ analyzed: 0, notAnalyzed: 2, improvements: [], strengths: [] })
  })

  it('ignores finding ids it no longer knows', () => {
    const patterns = classPatterns([
      { studentName: 'Ana', submissionMode: 'chat', aiUseFindings: findings(['retired-finding']) },
    ])
    expect(patterns.improvements).toEqual([])
  })
})

describe('summarizeFindings', () => {
  it('stores ids and counts in summary order, without wording', () => {
    const handedOff = chat(
      message('user', 'Design my website with separate HTML and CSS files'),
      message('assistant', '```html\n' + SITE + '\n```'),
    )
    const stored = summarizeFindings(buildAiUseFeedback([handedOff], SITE))
    expect(stored.improvements[0]).toEqual({ id: 'hands-off-features', count: 1 })
    expect(JSON.stringify(stored)).not.toContain('Write features yourself')
  })
})

describe('topFinding', () => {
  it("tags the summary's first improvement", () => {
    const stored = JSON.stringify({
      strengths: [{ id: 'asks-questions', count: 51 }],
      improvements: [{ id: 'hands-off-features', count: 9 }, { id: 'mostly-ai-code', count: 83 }],
    })
    expect(topFinding(stored)).toEqual({ tag: '9 hand-offs', label: 'Hand whole features to the AI' })
  })

  it('is null with nothing to work on, or nothing stored', () => {
    expect(topFinding(JSON.stringify({ strengths: [{ id: 'asks-questions', count: 3 }], improvements: [] }))).toBeNull()
    expect(topFinding(null)).toBeNull()
  })
})
