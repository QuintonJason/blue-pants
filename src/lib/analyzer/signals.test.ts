import { describe, it, expect } from 'vitest'
import {
  isAcknowledgment,
  isCodeReviewRequest,
  isErrorDiscussion,
  isLongContext,
  isQuestion,
  isShortPrompt,
  getMessageSignals,
} from './signals'

describe('isQuestion', () => {
  it('accepts question marks and opening interrogatives', () => {
    for (const text of [
      'Can you show me the HTML and CSS code?',
      'What is the difference between auto-fit and auto-fill',
      'Why does this collapse',
      'How do I center this',
      'Explain the box model to me',
      'Help me understand specificity',
    ]) {
      expect(isQuestion(text), text).toBe(true)
    }
  })

  it('does not treat words merely containing an interrogative as a question', () => {
    // These all matched before, because detection used substring containment:
    // "shower" contains "how", "somewhere" contains "where".
    for (const text of [
      'Take a shower',
      'This however works fine',
      'Use whatever value you like',
      'Somewhere in the file there is a typo',
      'I know what I want to build',
      'Showing the grid now',
    ]) {
      expect(isQuestion(text), text).toBe(false)
    }
  })

  it('handles empty input', () => {
    expect(isQuestion('')).toBe(false)
    expect(isQuestion(null)).toBe(false)
    expect(isQuestion(undefined)).toBe(false)
  })
})

describe('isErrorDiscussion', () => {
  it('accepts explicit failure vocabulary', () => {
    for (const text of [
      'I am getting an error - the image is not loading',
      'Console says ERR_FILE_NOT_FOUND and it crashes',
      'The build failed',
      'There is a bug in my hover state',
      'This is broken',
      "The layout doesn't work on mobile",
      'Help me debug this',
    ]) {
      expect(isErrorDiscussion(text), text).toBe(true)
    }
  })

  it('ignores vocabulary that is ordinary in code talk', () => {
    // `null`, `undefined`, `fix`, `wrong` and `mistake` used to count as debugging,
    // so a student who never debugged anything still scored for it.
    for (const text of [
      'Should this default to null or undefined',
      'Can you fix the alignment to be centered',
      'Is a wrong guess better than no guess',
      'I want to avoid any mistake in the markup',
    ]) {
      expect(isErrorDiscussion(text), text).toBe(false)
    }
  })
})

describe('isCodeReviewRequest', () => {
  it('accepts review asks', () => {
    for (const text of [
      'Can you review my hover effect code?',
      'Any feedback on this approach',
      'How would you improve this',
      'Any suggestions',
      'Is this best practice',
      'Can you check my code for problems',
    ]) {
      expect(isCodeReviewRequest(text), text).toBe(true)
    }
  })

  it('does not fire on unrelated prose', () => {
    expect(isCodeReviewRequest('Build a card component')).toBe(false)
  })
})

describe('isAcknowledgment', () => {
  it('recognises content-free replies', () => {
    for (const text of ['thanks', 'Thanks!', 'ok', 'Okay, got it', 'perfect', 'yes']) {
      expect(isAcknowledgment(text), text).toBe(true)
    }
  })

  it('does not swallow real messages that start with a similar word', () => {
    expect(isAcknowledgment('Yesterday this worked, today it fails')).toBe(false)
    expect(isAcknowledgment('Nope is not a valid CSS value, so why does it parse')).toBe(false)
  })
})

describe('length signals', () => {
  it('classifies short prompts, excluding acknowledgments', () => {
    expect(isShortPrompt('make it blue')).toBe(true)
    expect(isShortPrompt('thanks')).toBe(false)
    expect(isShortPrompt('')).toBe(false)
    expect(isShortPrompt('x'.repeat(80))).toBe(false)
  })

  it('classifies long context', () => {
    expect(isLongContext('x'.repeat(501))).toBe(true)
    expect(isLongContext('x'.repeat(400))).toBe(false)
  })
})

describe('getMessageSignals', () => {
  it('returns no signals for assistant messages', () => {
    // The assistant saying "that error means..." is not the student debugging.
    const signals = getMessageSignals('assistant', 'That error means the path is wrong')
    expect(Object.values(signals).every(v => v === false)).toBe(true)
  })

  it('reports every signal a student message carries', () => {
    const signals = getMessageSignals('user', 'Can you review why this throws an error?')
    expect(signals.isQuestion).toBe(true)
    expect(signals.isErrorDiscussion).toBe(true)
    expect(signals.isCodeReview).toBe(true)
  })
})
