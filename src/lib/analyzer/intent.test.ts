import { describe, it, expect } from 'vitest'
import { classifyPrompts } from './intent'
import { computeMetrics } from './metrics'
import { getHighlightSummary, highlightChat } from './highlighter'
import { chat, message } from './fixtures'

const PAGE_CODE = Array.from({ length: 20 }, (_, i) => `<p class="line-${i}">Line ${i}</p>`).join('\n')
const SITE_REPLY = `Here is your site:\n\n<CodeBlock language="html" editable>\n${PAGE_CODE}\n</CodeBlock>`

const intentsOf = (c: ReturnType<typeof chat>) =>
  classifyPrompts(c).filter((_, i) => c.messages[i].role === 'user')

describe('classifyPrompts: off-topic', () => {
  it('marks image editing and story writing, and their follow-ups', () => {
    const c = chat(
      message('user', '[image] give these images a transparent background'),
      message('assistant', 'Done, here are the files.'),
      message('user', 'can i get them separately'),
      message('assistant', 'Here they are.'),
      message('user', 'create a one sentence summary of this\nThe cat crept through the reeds; nobody saw her.'),
      message('assistant', 'A lone cat slips unseen through the reeds.'),
      message('user', 'no spoilers'),
      message('assistant', 'A cat sets out at dusk.'),
    )
    expect(intentsOf(c).map(i => i.offTopic)).toEqual([true, true, true, true])
  })

  it('keeps questions about images on the page on-topic', () => {
    const c = chat(
      message('user', 'how to include an image on the profile in cats.html'),
      message('assistant', 'Use an img tag.'),
      message('user', 'the image is not loading'),
      message('assistant', 'Check the path.'),
      message('user', 'put her picture and name in a box and center the name'),
      message('assistant', 'Sure.'),
    )
    expect(intentsOf(c).map(i => i.offTopic)).toEqual([false, false, false])
  })

  it('does not let an on-topic exchange pass the topic to a follow-up', () => {
    const c = chat(
      message('user', 'why isnt the background showing'),
      message('assistant', 'Check the url() path.'),
      message('user', 'more dramatic'),
      message('assistant', 'Try a darker overlay.'),
    )
    expect(intentsOf(c)[1].offTopic).toBe(false)
  })
})

describe('classifyPrompts: delegation', () => {
  it('marks requests that hand over a feature, including tagged code replies', () => {
    const c = chat(
      message('user', 'Design my RainClan website using separate HTML, CSS, and JavaScript files'),
      message('assistant', SITE_REPLY),
      message('user', 'take the html for all pages so i can copy and paste'),
      message('assistant', '```html\n' + PAGE_CODE + '\n```'),
    )
    expect(intentsOf(c).map(i => i.delegation)).toEqual([true, true])
  })

  it('marks a request answered with a downloadable code file', () => {
    const c = chat(
      message('user', 'make all the units consistent in my css'),
      message('assistant', 'Here you go: [main.css](sandbox:/mnt/data/main_consistent.css)'),
    )
    expect(intentsOf(c)[0].delegation).toBe(true)
  })

  it('does not mark questions, examples, or small asks', () => {
    const c = chat(
      message('user', 'how to create columns'),
      message('assistant', SITE_REPLY),
      message('user', 'give me an example of a simple website css'),
      message('assistant', SITE_REPLY),
      message('user', 'create a hover color for the nav links'),
      message('assistant', '```css\nnav a:hover { color: teal; }\n```'),
    )
    expect(intentsOf(c).map(i => i.delegation)).toEqual([false, false, false])
  })
})

describe('off-topic requests in scoring', () => {
  const c = chat(
    message('user', 'why isnt my nav showing'),
    message('assistant', 'Check display.'),
    message('user', 'create a one sentence summary of this\n' + 'The story goes on. '.repeat(40)),
    message('assistant', 'A summary.'),
  )

  it('are left out of the collaboration metrics', () => {
    const metrics = computeMetrics(c)
    expect(metrics.userMessages).toBe(1)
    expect(metrics.longPromptCount).toBe(0)
    expect(metrics.offTopicCount).toBe(1)
  })

  it('are left out of the highlight counts and badged instead', () => {
    const highlighted = highlightChat(c)
    expect(getHighlightSummary(highlighted).longContexts).toBe(0)
    expect(highlighted[2].highlightType).toBe('off-topic')
  })
})
