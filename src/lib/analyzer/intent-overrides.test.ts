import { describe, it, expect } from 'vitest'
import { applyIntentOverrides, flaggedMessages, parseIntentOverrides, rulingAgreement, setRuling } from './intent-overrides'
import { computeAggregateMetrics } from './metrics'
import { buildAiUseFeedback } from './feedback'
import { chat, message } from './fixtures'

const PAGE_CODE = Array.from({ length: 20 }, (_, i) => `<p class="line-${i}">Line ${i}</p>`).join('\n')

const transcript = () => [
  chat(
    message('user', 'Design my RainClan website using separate HTML, CSS, and JavaScript files'),
    message('assistant', '```html\n' + PAGE_CODE + '\n```'),
    message('user', 'why is my nav not centered'),
    message('assistant', 'Use flex.'),
    message('user', 'give these images a transparent background'),
    message('assistant', 'Done.'),
  ),
]

describe('flaggedMessages', () => {
  it('lists detected hand-offs and off-topic messages', () => {
    const flagged = flaggedMessages(transcript(), {})
    expect(flagged.map(f => [f.anchor, f.detected.delegation, f.detected.offTopic])).toEqual([
      ['chat-0-message-0', true, false],
      ['chat-0-message-4', false, true],
    ])
    expect(flagged.every(f => f.ruling === null)).toBe(true)
  })

  it('shows what counts after a ruling, and keeps a ruled message listed', () => {
    const flagged = flaggedMessages(transcript(), { 'chat-0-message-0': { delegation: false } })
    expect(flagged[0].detected.delegation).toBe(true)
    expect(flagged[0].counted.delegation).toBe(false)
    expect(flagged[0].ruling).toEqual({ delegation: false })
  })
})

describe('applyIntentOverrides', () => {
  it('changes what scoring and the summary count, without changing the transcript', () => {
    const chats = transcript()
    const before = JSON.stringify(chats)
    const ruled = applyIntentOverrides(chats, { 'chat-0-message-0': { delegation: false } })

    expect(computeAggregateMetrics(chats).delegationCount).toBe(1)
    expect(computeAggregateMetrics(ruled).delegationCount).toBe(0)
    expect(buildAiUseFeedback(chats, null).improvements.map(p => p.id)).toContain('hands-off-features')
    expect(buildAiUseFeedback(ruled, null).improvements.map(p => p.id)).not.toContain('hands-off-features')
    expect(JSON.stringify(chats)).toBe(before)
  })

  it('can bring an off-topic message back into scoring', () => {
    const ruled = applyIntentOverrides(transcript(), { 'chat-0-message-4': { offTopic: false } })
    expect(computeAggregateMetrics(transcript()).offTopicCount).toBe(1)
    expect(computeAggregateMetrics(ruled).offTopicCount).toBe(0)
  })
})

describe('setRuling', () => {
  it('records a disagreement and removes it when ruled back to the detection', () => {
    const overruled = setRuling(transcript(), {}, 'chat-0-message-0', 'delegation', false)
    expect(overruled).toEqual({ 'chat-0-message-0': { delegation: false } })
    expect(setRuling(transcript(), overruled, 'chat-0-message-0', 'delegation', true)).toEqual({})
  })

  it('keeps rulings on other kinds and messages', () => {
    const overrides = { 'chat-0-message-0': { offTopic: true }, 'chat-0-message-2': { delegation: true } }
    expect(setRuling(transcript(), overrides, 'chat-0-message-0', 'offTopic', false)).toEqual({
      'chat-0-message-2': { delegation: true },
    })
    expect(setRuling(transcript(), overrides, 'chat-0-message-4', 'offTopic', false)).toEqual({
      ...overrides,
      'chat-0-message-4': { offTopic: false },
    })
  })

  it("judges a ruling against what counts with the message's other ruling in place", () => {
    // Ruled off-topic, the hand-off is no longer detected; ruling it a hand-off is a real disagreement.
    const offTopic = setRuling(transcript(), {}, 'chat-0-message-0', 'offTopic', true)
    expect(flaggedMessages(transcript(), offTopic)[0].counted).toEqual({ offTopic: true, delegation: false })
    expect(setRuling(transcript(), offTopic, 'chat-0-message-0', 'delegation', true)).toEqual({
      'chat-0-message-0': { offTopic: true, delegation: true },
    })
  })

  it('rejects an anchor with no message', () => {
    expect(() => setRuling(transcript(), {}, 'chat-3-message-0', 'delegation', false)).toThrow()
  })
})

describe('rulingAgreement', () => {
  it('counts flags and how many were overruled', () => {
    const flagged = flaggedMessages(transcript(), { 'chat-0-message-0': { delegation: false } })
    expect(rulingAgreement(flagged)).toEqual({
      delegation: { flagged: 1, overruled: 1 },
      offTopic: { flagged: 1, overruled: 0 },
    })
  })
})

describe('parseIntentOverrides', () => {
  it('reads nothing from empty or malformed storage', () => {
    expect(parseIntentOverrides(null)).toEqual({})
    expect(parseIntentOverrides('nope')).toEqual({})
    expect(parseIntentOverrides('[1]')).toEqual({})
  })
})
