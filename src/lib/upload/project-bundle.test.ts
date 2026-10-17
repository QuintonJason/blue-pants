import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { bundleProject, expandZip, isProjectCodeFile } from './project-bundle'

describe('bundleProject', () => {
  it('inlines local stylesheets and scripts into the entry page', () => {
    const { code, entry, inlined, appended } = bundleProject([
      { path: 'site/index.html', content: '<head><link rel="stylesheet" href="css/style.css"></head><body><script type="module" src="./js/app.js"></script></body>' },
      { path: 'site/css/style.css', content: 'body { color: red; }' },
      { path: 'site/js/app.js', content: 'console.log("hi")' },
    ])

    expect(entry).toBe('index.html')
    expect(inlined.sort()).toEqual(['css/style.css', 'js/app.js'])
    expect(appended).toEqual([])
    expect(code).toContain('<style>\n/* css/style.css */\nbody { color: red; }\n</style>')
    expect(code).toContain('<script type="module">\n/* js/app.js */\nconsole.log("hi")\n</script>')
    expect(code).not.toContain('src=')
  })

  it('leaves CDN and missing references alone', () => {
    const html = '<link rel="stylesheet" href="https://cdn.example.com/x.css"><script src="missing.js"></script>'
    expect(bundleProject([{ path: 'index.html', content: html }]).code).toBe(html)
  })

  it('resolves paths relative to a nested entry page', () => {
    const { inlined } = bundleProject([
      { path: 'pages/index.html', content: '<link href="../shared.css" rel="stylesheet">' },
      { path: 'shared.css', content: 'p {}' },
    ])
    expect(inlined).toEqual(['shared.css'])
  })

  it('keeps unlinked files in a trailing comment so they are still analyzed', () => {
    const { code, appended } = bundleProject([
      { path: 'index.html', content: '<h1>Hi</h1>' },
      { path: 'notes.js', content: 'const a = "-->"' },
    ])
    expect(appended).toEqual(['notes.js'])
    expect(code).toMatch(/<!-- Other submitted files\n\n==== notes\.js ====\nconst a = "-- >"\n-->\n$/)
  })

  it('escapes closing tags inside inlined scripts', () => {
    const { code } = bundleProject([
      { path: 'index.html', content: '<script src="a.js"></script>' },
      { path: 'a.js', content: 'el.innerHTML = "</script>"' },
    ])
    expect(code).toContain('"<\\/script>"')
  })

  it('concatenates projects with no HTML page under file headers', () => {
    const { code, entry } = bundleProject([
      { path: 'proj/main.py', content: 'import util' },
      { path: 'proj/util.py', content: 'x = 1' },
    ])
    expect(entry).toBeNull()
    expect(code).toBe('==== main.py ====\nimport util\n\n==== util.py ====\nx = 1')
  })

  it('passes a single non-HTML file through unchanged', () => {
    expect(bundleProject([{ path: 'app.js', content: 'let x' }]).code).toBe('let x')
  })
})

describe('isProjectCodeFile', () => {
  it('skips dependencies, hidden folders, minified and binary files', () => {
    expect(isProjectCodeFile('proj/app.js')).toBe(true)
    expect(isProjectCodeFile('proj/node_modules/lib/index.js')).toBe(false)
    expect(isProjectCodeFile('proj/.git/config.txt')).toBe(false)
    expect(isProjectCodeFile('proj/vendor/jquery.min.js')).toBe(false)
    expect(isProjectCodeFile('proj/logo.png')).toBe(false)
    expect(isProjectCodeFile('proj/big.js', 500_000)).toBe(false)
  })

  it('skips libraries students include unmodified', () => {
    expect(isProjectCodeFile('proj/css/normalize.css')).toBe(false)
    expect(isProjectCodeFile('proj/js/jquery-3.7.1.js')).toBe(false)
    expect(isProjectCodeFile('proj/js/vendor/anything.js')).toBe(false)
    expect(isProjectCodeFile('proj/css/main.css')).toBe(true)
  })
})

describe('expandZip', () => {
  it('extracts code files under the zip name and skips the rest', () => {
    const zip = zipSync({
      'index.html': strToU8('<h1>Hi</h1>'),
      'img/logo.png': new Uint8Array([137, 80, 78, 71, 0]),
      '__MACOSX/._index.html': strToU8('junk'),
    })
    expect(expandZip('jane_smith.zip', zip)).toEqual([
      { path: 'jane_smith/index.html', content: '<h1>Hi</h1>' },
    ])
  })
})
