'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, FolderOpen, FileCode, X, Info } from 'lucide-react'
import { bundleProject, type ProjectFile } from '@/lib/upload/project-bundle'
import { readDataTransfer, readFileList, type ReadResult } from '@/lib/upload/read-upload'

// Not in React's input typings, but supported by every current browser.
const folderPickerProps = { webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>

interface CodeUploadProps {
  /** Receives the bundled project, or '' once every file is removed. */
  onBundle: (code: string) => void
}

/**
 * Accepts loose files, a folder, or a zip, and flattens them into the single
 * string a submission stores (see bundleProject).
 */
export function CodeUpload({ onBundle }: CodeUploadProps) {
  const [files, setFiles] = useState<ProjectFile[]>([])
  const [skipped, setSkipped] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const bundle = useMemo(() => bundleProject(files), [files])

  // Only report once something was uploaded, so pasted code isn't wiped on mount.
  const touched = useRef(false)
  useEffect(() => {
    if (touched.current) onBundle(bundle.code)
  }, [bundle, onBundle])

  const update = (change: (prev: ProjectFile[]) => ProjectFile[]) => {
    touched.current = true
    setFiles(change)
  }

  const add = async (read: Promise<ReadResult>) => {
    setError('')
    try {
      const result = await read
      update(prev => {
        const byPath = new Map(prev.map(f => [f.path, f]))
        result.files.forEach(f => byPath.set(f.path, f))
        return Array.from(byPath.values())
      })
      setSkipped(result.skipped)
      if (result.files.length === 0) setError('No code files found in that upload.')
    } catch {
      setError('Could not read that upload.')
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) add(readFileList(e.target.files))
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    add(readDataTransfer(e.dataTransfer))
  }

  const remove = (path: string) => update(prev => prev.filter(f => f.path !== path))

  const clear = () => {
    update(() => [])
    setSkipped([])
  }

  const role = (path: string) => {
    if (path === bundle.entry) return 'entry page'
    if (bundle.inlined.includes(path)) return 'inlined'
    return null
  }

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragging ? 'border-violet-400 bg-violet-50/50' : 'border-muted-foreground/25'
        }`}
      >
        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium">Drop a project folder, zip, or files here</p>
        <p className="text-xs text-muted-foreground mt-1">
          Linked CSS and JS are inlined into the HTML page. Images and node_modules are skipped.
        </p>
        <div className="flex justify-center gap-2 mt-4">
          <label>
            <input type="file" multiple className="hidden" onChange={handleInput} />
            <Button type="button" variant="outline" size="sm" asChild>
              <span className="cursor-pointer">
                <FileCode className="w-4 h-4 mr-2" />
                Choose files or zip
              </span>
            </Button>
          </label>
          <label>
            <input type="file" className="hidden" onChange={handleInput} {...folderPickerProps} />
            <Button type="button" variant="outline" size="sm" asChild>
              <span className="cursor-pointer">
                <FolderOpen className="w-4 h-4 mr-2" />
                Choose folder
              </span>
            </Button>
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {files.length > 0 && (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <span className="text-sm font-medium">
              {files.length} file{files.length === 1 ? '' : 's'} bundled
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={clear}>
              Clear
            </Button>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y">
            {[...files].sort((a, b) => a.path.localeCompare(b.path)).map(file => (
              <div key={file.path} className="flex items-center justify-between px-3 py-1.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs">{file.path}</span>
                  {role(file.path) && (
                    <Badge variant="outline" className="text-xs shrink-0">{role(file.path)}</Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={`Remove ${file.path}`}
                  onClick={() => remove(file.path)}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          {(bundle.appended.length > 0 && bundle.entry) || skipped.length > 0 ? (
            <div className="flex items-start gap-2 px-3 py-2 border-t text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {bundle.entry && bundle.appended.length > 0 &&
                  `${bundle.appended.length} file(s) aren't linked from ${bundle.entry}; they're kept in a comment at the end so they're still analyzed. `}
                {skipped.length > 0 &&
                  `Skipped ${skipped.length} non-code file(s) from the last upload.`}
              </span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
