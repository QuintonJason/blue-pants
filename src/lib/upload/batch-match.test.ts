import { describe, it, expect } from 'vitest'
import { acceptBatchFile, matchBatchRow } from './batch-match'

const files = [
  { path: 'class/jane_smith/chat.json', content: '{"jane":1}' },
  { path: 'class/jane_smith/index.html', content: '<h1>Jane</h1>' },
  { path: 'class/jane_smith/style.css', content: 'h1 {}' },
  { path: 'class/li-wei/chat.json', content: '{"li":1}' },
  { path: 'class/li-wei/index.html', content: '<h1>Li</h1>' },
  { path: 'sam_chat.json', content: '{"sam":1}' },
  { path: 'sam_code.html', content: '<h1>Sam</h1>' },
]
const paths = (fs: { path: string }[]) => fs.map(f => f.path)

describe('matchBatchRow', () => {
  it("prefers the student's own copy when every export has the same name", () => {
    const li = matchBatchRow({ studentName: 'Li Wei', chatRef: 'chat.json' }, files)
    expect(paths(li.chatFiles)).toEqual(['class/li-wei/chat.json'])
  })

  it("uses the student's folder as their code when code_file is blank", () => {
    const jane = matchBatchRow({ studentName: 'Jane Smith', chatRef: 'chat.json' }, files)
    expect(paths(jane.codeFiles)).toEqual(['class/jane_smith/index.html', 'class/jane_smith/style.css'])
    expect(jane.missingCode).toBe(false)
  })

  it('matches a code_file that names a folder or zip', () => {
    const jane = matchBatchRow({ studentName: 'J. Smith', chatRef: 'chat.json', codeRef: 'jane_smith.zip' }, files)
    expect(paths(jane.codeFiles)).toHaveLength(2)
  })

  it('still matches loose files by name', () => {
    const sam = matchBatchRow({ studentName: 'Sam', chatRef: 'sam_chat.json', codeRef: 'sam_code.html' }, files)
    expect(paths(sam.chatFiles)).toEqual(['sam_chat.json'])
    expect(paths(sam.codeFiles)).toEqual(['sam_code.html'])
  })

  it('reports a named code file that was not uploaded', () => {
    const row = matchBatchRow({ studentName: 'Sam', chatRef: 'sam_chat.json', codeRef: 'nope.html' }, files)
    expect(row.missingCode).toBe(true)
  })

  it('never treats a name that normalizes to nothing as matching every folder', () => {
    const row = matchBatchRow({ studentName: '王芳', chatRef: 'sam_chat.json' }, files)
    expect(row.codeFiles).toEqual([])
  })
})

describe('acceptBatchFile', () => {
  it('lets large chat exports through but still skips dependencies', () => {
    expect(acceptBatchFile('class/jane/chat.json', 3_000_000)).toBe(true)
    expect(acceptBatchFile('proj/node_modules/x/package.json', 100)).toBe(false)
    expect(acceptBatchFile('proj/big.js', 3_000_000)).toBe(false)
  })
})
