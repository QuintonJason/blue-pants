'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Upload,
  FileText,
  Check,
  X,
  AlertTriangle,
  Loader2,
  Users,
  FileJson,
  Code
} from 'lucide-react'

interface CsvRow {
  student_name: string
  chat_file: string
  code_file?: string
}

interface FileData {
  name: string
  content: string
}

interface MatchedSubmission {
  studentName: string
  chatFiles: FileData[]
  codeFile: FileData | null
  status: 'ready' | 'missing_chat' | 'missing_code' | 'imported' | 'error'
  errorMessage?: string
}

export default function BatchImportPage() {
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.id

  const [assignment, setAssignment] = useState<{ name: string } | null>(null)
  const [csvText, setCsvText] = useState('')
  const [files, setFiles] = useState<FileData[]>([])
  const [matches, setMatches] = useState<MatchedSubmission[]>([])
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ success: number; failed: number } | null>(null)

  // Fetch assignment info
  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}`)
      .then(r => r.json())
      .then(setAssignment)
      .catch(console.error)
  }, [assignmentId])

  // Parse CSV and match files
  const parseCsvAndMatch = useCallback(() => {
    if (!csvText.trim()) {
      setMatches([])
      return
    }

    const lines = csvText.trim().split('\n')
    if (lines.length < 2) {
      setMatches([])
      return
    }

    // Parse header
    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const nameIdx = header.findIndex(h => h.includes('student') || h.includes('name'))
    const chatIdx = header.findIndex(h => h.includes('chat'))
    const codeIdx = header.findIndex(h => h.includes('code'))

    if (nameIdx === -1 || chatIdx === -1) {
      setMatches([])
      return
    }

    // Parse rows
    const rows: CsvRow[] = []
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      if (cols.length > Math.max(nameIdx, chatIdx)) {
        rows.push({
          student_name: cols[nameIdx]?.trim() || '',
          chat_file: cols[chatIdx]?.trim() || '',
          code_file: codeIdx !== -1 ? cols[codeIdx]?.trim() : undefined,
        })
      }
    }

    // Match with uploaded files
    const matched: MatchedSubmission[] = rows.map(row => {
      // Find chat files (might be comma-separated or multiple with same prefix)
      const chatFileNames = row.chat_file.split(';').map(f => f.trim()).filter(Boolean)
      const chatFiles = chatFileNames
        .map(name => files.find(f => f.name === name || f.name.includes(name)))
        .filter((f): f is FileData => f !== undefined)

      // Find code file
      const codeFile = row.code_file
        ? files.find(f => f.name === row.code_file || f.name.includes(row.code_file || ''))
        : null

      let status: MatchedSubmission['status'] = 'ready'
      if (chatFiles.length === 0) status = 'missing_chat'
      else if (row.code_file && !codeFile) status = 'missing_code'

      return {
        studentName: row.student_name,
        chatFiles,
        codeFile: codeFile || null,
        status,
      }
    }).filter(m => m.studentName)

    setMatches(matched)
  }, [csvText, files])

  // Re-match when CSV or files change
  useEffect(() => {
    parseCsvAndMatch()
  }, [parseCsvAndMatch])

  // Handle file drop
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files)
    processFiles(droppedFiles)
  }, [])

  // Handle file input
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    processFiles(selectedFiles)
  }, [])

  const processFiles = async (fileList: File[]) => {
    const newFiles: FileData[] = []
    for (const file of fileList) {
      try {
        const content = await file.text()
        newFiles.push({ name: file.name, content })
      } catch (e) {
        console.error(`Error reading ${file.name}:`, e)
      }
    }
    setFiles(prev => [...prev, ...newFiles])
  }

  // Remove a file
  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name))
  }

  // Import all matched submissions using batch API
  const handleImportAll = async () => {
    const readyMatches = matches.filter(m => m.status === 'ready')
    if (readyMatches.length === 0) return

    setImporting(true)

    try {
      const submissionsData = readyMatches.map(match => ({
        studentName: match.studentName,
        chatExports: match.chatFiles.map(f => f.content),
        finalCode: match.codeFile?.content || null,
      }))

      const res = await fetch(`/api/assignments/${assignmentId}/batch-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions: submissionsData }),
      })

      if (res.ok) {
        const data = await res.json()

        // Update match statuses based on results
        setMatches(prev =>
          prev.map(m => {
            const result = data.results?.find((r: { studentName: string; success: boolean; error?: string }) =>
              r.studentName === m.studentName
            )
            if (result) {
              return {
                ...m,
                status: result.success ? 'imported' as const : 'error' as const,
                errorMessage: result.error,
              }
            }
            return m
          })
        )

        setImportResults({ success: data.success, failed: data.failed })
      } else {
        const data = await res.json()
        // Mark all as error
        setMatches(prev =>
          prev.map(m =>
            m.status === 'ready'
              ? { ...m, status: 'error' as const, errorMessage: data.error || 'Batch import failed' }
              : m
          )
        )
        setImportResults({ success: 0, failed: readyMatches.length })
      }
    } catch {
      // Mark all as error
      setMatches(prev =>
        prev.map(m =>
          m.status === 'ready'
            ? { ...m, status: 'error' as const, errorMessage: 'Network error' }
            : m
        )
      )
      setImportResults({ success: 0, failed: readyMatches.length })
    }

    setImporting(false)
  }

  const readyCount = matches.filter(m => m.status === 'ready').length
  const importedCount = matches.filter(m => m.status === 'imported').length

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href={`/assignments/${assignmentId}`}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">Batch Import</h1>
              <p className="text-sm text-muted-foreground">
                {assignment?.name || 'Loading...'}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Column - CSV & Files */}
          <div className="space-y-6">
            {/* CSV Input */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  CSV Mapping
                </CardTitle>
                <CardDescription>
                  Paste or upload a CSV with columns: student_name, chat_file, code_file (optional)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="student_name,chat_file,code_file&#10;John Smith,john_chat.json,john_code.html&#10;Jane Doe,jane_chat.json,jane_code.html"
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        file.text().then(setCsvText)
                      }
                    }}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload">
                    <Button variant="outline" size="sm" asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload CSV
                      </span>
                    </Button>
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* File Drop Zone */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Files ({files.length})
                </CardTitle>
                <CardDescription>
                  Drag and drop chat JSON files and code files here
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  onDrop={handleFileDrop}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed rounded-lg p-8 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-colors cursor-pointer"
                >
                  <input
                    type="file"
                    multiple
                    accept=".json,.html,.css,.js,.txt"
                    onChange={handleFileInput}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Drop files here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports .json, .html, .css, .js, .txt
                    </p>
                  </label>
                </div>

                {files.length > 0 && (
                  <div className="mt-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {files.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center justify-between p-2 bg-slate-50 rounded text-sm"
                      >
                        <div className="flex items-center gap-2">
                          {file.name.endsWith('.json') ? (
                            <FileJson className="w-4 h-4 text-blue-500" />
                          ) : (
                            <Code className="w-4 h-4 text-green-500" />
                          )}
                          <span className="truncate max-w-[200px]">{file.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => removeFile(file.name)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Preview & Import */}
          <div className="space-y-6">
            {/* Preview Table */}
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      Preview ({matches.length} students)
                    </CardTitle>
                    <CardDescription>
                      Matched submissions ready for import
                    </CardDescription>
                  </div>
                  {readyCount > 0 && (
                    <Badge variant="success">{readyCount} ready</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {matches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No matches yet</p>
                    <p className="text-xs">Add CSV mapping and upload files</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {matches.map((match, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border ${
                          match.status === 'ready'
                            ? 'bg-green-50 border-green-200'
                            : match.status === 'imported'
                            ? 'bg-blue-50 border-blue-200'
                            : match.status === 'error'
                            ? 'bg-red-50 border-red-200'
                            : 'bg-orange-50 border-orange-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{match.studentName}</span>
                          {match.status === 'ready' && (
                            <Badge variant="success" className="text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              Ready
                            </Badge>
                          )}
                          {match.status === 'imported' && (
                            <Badge className="bg-blue-500 text-xs">
                              <Check className="w-3 h-3 mr-1" />
                              Imported
                            </Badge>
                          )}
                          {match.status === 'missing_chat' && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Missing Chat
                            </Badge>
                          )}
                          {match.status === 'missing_code' && (
                            <Badge variant="outline" className="text-xs text-orange-600">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Missing Code
                            </Badge>
                          )}
                          {match.status === 'error' && (
                            <Badge variant="destructive" className="text-xs">
                              <X className="w-3 h-3 mr-1" />
                              Error
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-1">
                            <FileJson className="w-3 h-3" />
                            {match.chatFiles.length > 0
                              ? match.chatFiles.map(f => f.name).join(', ')
                              : 'No chat file found'}
                          </div>
                          <div className="flex items-center gap-1">
                            <Code className="w-3 h-3" />
                            {match.codeFile ? match.codeFile.name : 'No code file'}
                          </div>
                          {match.errorMessage && (
                            <div className="text-red-600">{match.errorMessage}</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Import Button */}
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                {importResults && (
                  <div className="mb-4 p-4 rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Import Complete</span>
                      <div className="space-x-2">
                        <Badge variant="success">{importResults.success} imported</Badge>
                        {importResults.failed > 0 && (
                          <Badge variant="destructive">{importResults.failed} failed</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleImportAll}
                    disabled={readyCount === 0 || importing}
                    className="flex-1 bg-gradient-to-r from-violet-500 to-violet-600"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Import All ({readyCount})
                      </>
                    )}
                  </Button>
                  {importedCount > 0 && (
                    <Link href={`/assignments/${assignmentId}`}>
                      <Button variant="outline">
                        View Submissions
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}

// Helper function to parse CSV lines (handles quoted values)
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}
