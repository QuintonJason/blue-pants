/**
 * Project bundling
 *
 * Everything downstream of an upload (scoring, the AI-vs-final diff, the live
 * preview) treats a submission's final code as one string. Students hand in
 * folders and zips, so this flattens a project into that string: the entry HTML
 * page with its local stylesheets and scripts inlined, so the preview renders
 * like the real project and the analyzers see every line the student wrote.
 */

import { unzipSync } from 'fflate'

export interface ProjectFile {
  path: string
  content: string
}

export interface BundleResult {
  code: string
  /** Display path of the HTML page the bundle is built around, if any. */
  entry: string | null
  /** Files folded into the entry page through a <link> or <script src>. */
  inlined: string[]
  /** Files nothing linked to, appended so no submitted code is dropped. */
  appended: string[]
}

const CODE_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'scss', 'sass', 'less',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte',
  'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'go', 'rs', 'swift', 'kt',
  'sql', 'sh', 'json', 'xml', 'md', 'txt',
])

const SKIP_DIRS = new Set([
  'node_modules', '__MACOSX', '__pycache__', 'dist', 'build', 'out', 'coverage', 'venv', 'vendor',
])

/**
 * Libraries students drop in unmodified. Scored as the student's own they skew
 * every measure; normalize.css alone is 6KB of someone else's CSS.
 */
const THIRD_PARTY_FILE = /^(normalize|reset|jquery|bootstrap|modernizr|popper|lodash)([.-][\w.-]*)?\.(css|js)$/i

const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'])

/** Larger files are almost always vendored libraries or generated output. */
export const MAX_FILE_BYTES = 200_000

export type FileFilter = (path: string, size: number) => boolean

/** Hidden folders and dependency/build output are never the student's own code. */
export function isSkippedDir(name: string): boolean {
  return name.startsWith('.') || SKIP_DIRS.has(name)
}

export function isProjectCodeFile(path: string, size = 0): boolean {
  if (size > MAX_FILE_BYTES) return false

  const segments = path.split('/').filter(Boolean)
  const fileName = segments[segments.length - 1] ?? ''
  if (segments.some(isSkippedDir)) return false
  if (SKIP_FILES.has(fileName) || /\.min\.(js|css)$/i.test(fileName)) return false
  if (THIRD_PARTY_FILE.test(fileName)) return false

  return CODE_EXTENSIONS.has(extension(fileName))
}

/** Text content of a file, or null when it is binary. */
export function decodeText(bytes: Uint8Array): string | null {
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.includes('\u0000') ? null : text
}

/**
 * Code files inside a zip, with paths prefixed by the zip's own name so a batch of
 * `jane_smith.zip`, `li_wei.zip` lines up with students the same way folders do.
 */
export function expandZip(
  zipName: string,
  bytes: Uint8Array,
  accept: FileFilter = isProjectCodeFile
): ProjectFile[] {
  const prefix = zipName.replace(/\.zip$/i, '')
  const entries = unzipSync(bytes, {
    filter: file => !file.name.endsWith('/') && accept(file.name, file.originalSize),
  })

  const files: ProjectFile[] = []
  for (const [name, data] of Object.entries(entries)) {
    const content = decodeText(data)
    if (content !== null) files.push({ path: `${prefix}/${name}`, content })
  }
  return files
}

/** Flatten a project into the single string a submission stores. */
export function bundleProject(input: ProjectFile[]): BundleResult {
  const files = stripCommonRoot(input).sort((a, b) => a.path.localeCompare(b.path))
  if (files.length === 0) return { code: '', entry: null, inlined: [], appended: [] }

  const entryFile = pickEntry(files)
  if (!entryFile && files.length === 1) {
    return { code: files[0].content, entry: null, inlined: [], appended: [] }
  }
  if (!entryFile) {
    return {
      code: files.map(f => `${fileHeader(f.path)}\n${f.content.trimEnd()}`).join('\n\n'),
      entry: null,
      inlined: [],
      appended: files.map(f => f.path),
    }
  }

  const byPath = new Map(files.map(f => [f.path, f]))
  const inlined = new Set<string>()
  const baseDir = dirname(entryFile.path)

  const resolveLocal = (ref: string) => {
    if (!ref || /^([a-z]+:|\/\/|#)/i.test(ref)) return undefined
    const file = byPath.get(joinPath(baseDir, ref.split(/[?#]/)[0]))
    if (file) inlined.add(file.path)
    return file
  }

  let html = entryFile.content.replace(/<link\b[^>]*>/gi, tag => {
    if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag
    const file = resolveLocal(attribute(tag, 'href') ?? '')
    if (!file) return tag
    return `<style>\n/* ${file.path} */\n${file.content.replace(/<\/style/gi, '<\\/style')}\n</style>`
  })

  html = html.replace(/<script\b([^>]*)>\s*<\/script\s*>/gi, (tag, attrs: string) => {
    const file = resolveLocal(attribute(tag, 'src') ?? '')
    if (!file) return tag
    const keptAttrs = attrs.replace(/\s*\bsrc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, '')
    return `<script${keptAttrs}>\n/* ${file.path} */\n${file.content.replace(/<\/script/gi, '<\\/script')}\n</script>`
  })

  // Left in an HTML comment: invisible in the preview, still read by the analyzers.
  const rest = files.filter(f => f !== entryFile && !inlined.has(f.path))
  if (rest.length > 0) {
    const body = rest
      .map(f => `${fileHeader(f.path)}\n${f.content.trimEnd().replace(/--!?>/g, '-- >')}`)
      .join('\n\n')
    html = `${html.trimEnd()}\n\n<!-- Other submitted files\n\n${body}\n-->\n`
  }

  return {
    code: html,
    entry: entryFile.path,
    inlined: Array.from(inlined),
    appended: rest.map(f => f.path),
  }
}

/** Shallowest index.html, else the shallowest HTML page. */
function pickEntry(files: ProjectFile[]): ProjectFile | undefined {
  const html = files
    .filter(f => /^html?$/.test(extension(f.path)))
    .sort((a, b) => depth(a.path) - depth(b.path))
  return html.find(f => /^index\.html?$/i.test(basename(f.path))) ?? html[0]
}

function stripCommonRoot(files: ProjectFile[]): ProjectFile[] {
  let result = files.map(f => ({ ...f, path: f.path.replace(/^\/+/, '') }))
  while (result.length > 0 && result.every(f => depth(f.path) > 0)) {
    const root = result[0].path.split('/')[0]
    if (!result.every(f => f.path.split('/')[0] === root)) break
    result = result.map(f => ({ ...f, path: f.path.slice(root.length + 1) }))
  }
  return result
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

function joinPath(dir: string, ref: string): string {
  const parts = ref.startsWith('/') ? [] : dir.split('/').filter(Boolean)
  for (const segment of ref.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment && segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

function fileHeader(path: string): string {
  return `==== ${path} ====`
}

function extension(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function dirname(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

function depth(path: string): number {
  return path.split('/').length - 1
}
