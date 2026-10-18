import { describe, it, expect } from 'vitest'
import { buildAiUseFeedback, feedbackToText } from './feedback'
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
      strengths: [{ title: 'You ask questions', detail: 'Often.', examples: [{ text: 'why does this work', anchor: 'chat-0-message-0' }] }],
      improvements: [{ title: 'Write it yourself', detail: 'Sometimes.', examples: [] }],
      notes: ['1 request was off-topic.'],
    })
    expect(text).toBe(
      'What you are doing well\n- You ask questions. Often.\n    "why does this work"\n\n' +
        'What to work on\n- Write it yourself. Sometimes.\n\n1 request was off-topic.'
    )
  })
})
