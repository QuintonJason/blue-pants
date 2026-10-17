/**
 * Browser-side reading of uploaded files, dropped folders and zips into
 * ProjectFiles. Pure bundling lives in project-bundle.ts.
 */

import {
  decodeText,
  expandZip,
  isProjectCodeFile,
  isSkippedDir,
  type FileFilter,
  type ProjectFile,
} from './project-bundle'

export interface ReadResult {
  files: ProjectFile[]
  /** Names of files left out: binaries, images, vendored or oversized files. */
  skipped: string[]
}

interface PathedFile {
  path: string
  file: File
}

/** Files from an <input type="file">, with or without webkitdirectory. */
export function readFileList(list: FileList | File[], accept?: FileFilter): Promise<ReadResult> {
  const pathed = Array.from(list).map(file => ({
    path: file.webkitRelativePath || file.name,
    file,
  }))
  return readPathedFiles(pathed, accept)
}

/** A drag-and-drop, walking into any dropped folders. */
export async function readDataTransfer(dt: DataTransfer, accept?: FileFilter): Promise<ReadResult> {
  // Entries must be taken synchronously: the DataTransfer is emptied after the first await.
  const entries = Array.from(dt.items)
    .map(item => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e)

  if (entries.length === 0) return readFileList(dt.files, accept)

  const pathed: PathedFile[] = []
  for (const entry of entries) pathed.push(...(await walkEntry(entry, '')))
  return readPathedFiles(pathed, accept)
}

async function readPathedFiles(
  pathed: PathedFile[],
  accept: FileFilter = isProjectCodeFile
): Promise<ReadResult> {
  const files: ProjectFile[] = []
  const skipped: string[] = []

  for (const { path, file } of pathed) {
    if (/\.zip$/i.test(path)) {
      try {
        const zipPath = path.replace(/\.zip$/i, '')
        files.push(...expandZip(zipPath, new Uint8Array(await file.arrayBuffer()), accept))
      } catch {
        skipped.push(path)
      }
      continue
    }

    if (!accept(path, file.size)) {
      skipped.push(path)
      continue
    }

    const content = decodeText(new Uint8Array(await file.arrayBuffer()))
    if (content === null) skipped.push(path)
    else files.push({ path, content })
  }

  return { files, skipped }
}

async function walkEntry(entry: FileSystemEntry, parent: string): Promise<PathedFile[]> {
  const path = parent ? `${parent}/${entry.name}` : entry.name

  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    )
    return [{ path, file }]
  }

  if (!entry.isDirectory || isSkippedDir(entry.name)) return []

  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  // readEntries returns results in pages (100 at a time in Chrome) until it returns none.
  for (;;) {
    const page = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    )
    if (page.length === 0) break
    children.push(...page)
  }

  const nested = await Promise.all(children.map(child => walkEntry(child, path)))
  return nested.flat()
}
