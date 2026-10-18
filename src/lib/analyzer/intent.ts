/**
 * Prompt Intent
 *
 * What a student message was for, which the per-message signals can't tell on
 * their own: it takes the assistant's reply and the surrounding exchange.
 *
 * - Off-topic: not about the program at all, like editing an image or rewriting
 *   a story. These are left out of every collaboration metric. Counting them let
 *   pasted story text earn "detailed context" credit and padded the iteration and
 *   short-prompt counts with requests that had nothing to do with the code.
 * - Delegation: asking for a whole feature or page and getting it. Not wrong in
 *   itself when an assignment allows AI, but it is the opposite of independence,
 *   so the rubric weighs it there.
 */

import { assistantCodeBlocks, extractCodeDownloads, type ParsedChat } from '../parser/chatgpt'
import { isErrorDiscussion } from './signals'
import { detectUnfencedCode } from './code-extractor'

export interface PromptIntent {
  offTopic: boolean
  delegation: boolean
}

const NONE: PromptIntent = { offTopic: false, delegation: false }

/** Mentions the program: its files, markup, styles or behaviour. */
const CODE_TERMS =
  /\b(html?|css|js|javascript|code|page|site|website|div|class|id|tag|file|link|href|nav|navigation|header|footer|button|form|script|style|font|colou?r|margin|padding|border|layout|columns?|grid|flex|src|favicon|scroll|section|main|body|element|selector|function|console|popup|pop up|tab|banner|hero|sorter|center|centre|align|box|position)\b|\.\w{2,4}\b|[<>{};]/i

const IMAGE_EDIT =
  /\b(transparent|aspect ratio|crop|resize|background removed|remove the background|generate (an? )?(image|picture|logo|icon)|draw)\b|\b(images?|pictures?|photos?|logo|drawing|art)\b/i

const WRITING =
  /\b(summary|summari[sz]e|story|stories|poem|essay|paragraph|proofread|spoilers?|reword|plot|synopsis)\b/i

/** Follow-ups this short inherit the topic of the exchange they continue. */
const FOLLOW_UP_MAX = 80

const DELEGATION_REQUEST =
  /^\s*(please\s+)?((can|could|would) you\s+)?(create|design|build|make|write|generate|code|give me|add)\b/i

const DELEGATION_SCOPE =
  /\b(website|site|pages?|form|navigation|nav|sorter|system|layout|section|header|footer|features?|html|css|javascript|js|script|code|tabs?|profiles?|popup|pop up|menu|gallery|toggle|filter)\b/i

const COPY_PASTE = /\bso i can (just )?copy( and| &)? paste\b/i

/** "give me an example of..." is asking to learn, not to be handed the work. */
const EXAMPLE = /\b(example|examples|sample)\b/i

/** Lines of reply code that make a request a hand-off rather than a small ask. */
const DELEGATION_MIN_REPLY_LINES = 15

/** One intent per message, aligned with chat.messages; assistant messages get NONE. */
export function classifyPrompts(chat: ParsedChat): PromptIntent[] {
  const intents: PromptIntent[] = chat.messages.map(() => NONE)
  let previousOffTopic = false

  chat.messages.forEach((msg, i) => {
    if (msg.role !== 'user') return
    // An attached screenshot says nothing about what's being asked.
    const content = (msg.content || '').replace(/\[image\]/g, '').trim()
    const { codeLines: reply, codeDownloads } = summarizeReply(chat, i)

    // Judge the request by its instruction line: a pasted story is full of
    // punctuation that would read as code. A pasted page, though, is code.
    // "the image isnt loading" is a bug on the page, not an image-editing request.
    const instruction = content.split('\n')[0]
    const aboutCode =
      CODE_TERMS.test(instruction) || isErrorDiscussion(instruction) || detectUnfencedCode(content) !== null
    const offTopicRequest = !aboutCode && reply === 0 && (IMAGE_EDIT.test(content) || WRITING.test(content))
    const offTopicFollowUp =
      previousOffTopic && !aboutCode && reply === 0 && content.length <= FOLLOW_UP_MAX
    // The teacher's ruling, where there is one, outranks what was detected.
    const offTopic = msg.teacherIntent?.offTopic ?? (offTopicRequest || offTopicFollowUp)

    // A reply that hands back a whole code file ("make all the units consistent
    // in my css" -> main_consistent_units.css) is a hand-off whatever the wording.
    const delegation =
      msg.teacherIntent?.delegation ??
      (!offTopic &&
        (codeDownloads > 0 ||
          (reply >= DELEGATION_MIN_REPLY_LINES &&
            !EXAMPLE.test(content) &&
            (COPY_PASTE.test(content) ||
              (DELEGATION_REQUEST.test(content) && DELEGATION_SCOPE.test(content))))))

    intents[i] = { offTopic, delegation }
    previousOffTopic = offTopic
  })

  return intents
}

/** Code in the assistant's answer to the student message at `index`. */
function summarizeReply(chat: ParsedChat, index: number) {
  let codeLines = 0
  let codeDownloads = 0
  for (let j = index + 1; j < chat.messages.length && chat.messages[j].role !== 'user'; j++) {
    const reply = chat.messages[j]
    for (const block of assistantCodeBlocks(reply)) codeLines += block.code.split('\n').length
    codeDownloads += extractCodeDownloads(reply.content).length
  }
  return { codeLines, codeDownloads }
}
