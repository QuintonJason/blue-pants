/**
 * Batch import matching: which uploaded files belong to which CSV row.
 *
 * Files can arrive loose, in one folder per student, or in one zip per student
 * (expanded to a folder named after the zip). Every student's export is often
 * named the same (`chat.json`), so a name match prefers the copy inside that
 * student's own folder.
 */

import { basename, isProjectCodeFile, isSkippedDir, type ProjectFile } from './project-bundle'

export interface BatchRow {
  studentName: string
  /** One or more chat export names, `;`-separated. */
  chatRef: string
  /** A code file, folder or zip name. Empty means "the student's folder, if any". */
  codeRef?: string
}

export interface BatchMatch {
  chatFiles: ProjectFile[]
  codeFiles: ProjectFile[]
  /** The CSV named code that isn't among the uploads. */
  missingCode: boolean
}

/** Chat exports are often several MB, so .json is let through the size cap. */
export function acceptBatchFile(path: string, size: number): boolean {
  if (/\.json$/i.test(path)) return !path.split('/').some(isSkippedDir)
  return isProjectCodeFile(path, size)
}

export function matchBatchRow(row: BatchRow, files: ProjectFile[]): BatchMatch {
  const studentKey = normalize(row.studentName)
  const inStudentFolder = (f: ProjectFile) => inFolder(f, studentKey)
  const preferStudent = (candidates: ProjectFile[]) =>
    candidates.find(inStudentFolder) ?? candidates[0]

  const chatFiles = row.chatRef
    .split(';')
    .map(ref => ref.trim())
    .filter(Boolean)
    .map(ref => {
      const exact = files.filter(f => basename(f.path) === ref)
      return preferStudent(exact.length > 0 ? exact : files.filter(f => basename(f.path).includes(ref)))
    })
    .filter((f): f is ProjectFile => f !== undefined)

  const isCode = (f: ProjectFile) => !chatFiles.includes(f) && isProjectCodeFile(f.path, f.content.length)
  const codeRef = row.codeRef?.trim()

  if (!codeRef) {
    return { chatFiles, codeFiles: files.filter(f => inStudentFolder(f) && isCode(f)), missingCode: false }
  }

  const exact = files.filter(f => basename(f.path) === codeRef && isCode(f))
  if (exact.length > 0) return { chatFiles, codeFiles: [preferStudent(exact)], missingCode: false }

  const folderKey = normalize(codeRef.replace(/\.zip$/i, ''))
  const folder = files.filter(f => inFolder(f, folderKey) && isCode(f))
  if (folder.length > 0) return { chatFiles, codeFiles: folder, missingCode: false }

  const partial = files.filter(f => basename(f.path).includes(codeRef) && isCode(f))
  return {
    chatFiles,
    codeFiles: partial.length > 0 ? [preferStudent(partial)] : [],
    missingCode: partial.length === 0,
  }
}

/** "Jane Smith", "jane_smith" and "jane-smith.zip" all compare equal. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function inFolder(file: ProjectFile, key: string): boolean {
  // A name with no ASCII letters or digits normalizes to '', which would match every folder.
  return key !== '' && file.path.split('/').slice(0, -1).some(d => normalize(d) === key)
}
