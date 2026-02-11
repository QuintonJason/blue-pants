'use client'

import { useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Upload,
  FileJson,
  FileCode,
  X,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

interface UploadedFile {
  name: string
  content: string
  type: 'chat' | 'code'
}

export default function SubmitPage() {
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.id

  const [studentName, setStudentName] = useState('')
  const [chatFiles, setChatFiles] = useState<UploadedFile[]>([])
  const [codeContent, setCodeContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleChatUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    for (const file of Array.from(files)) {
      try {
        const content = await file.text()
        // Validate JSON
        JSON.parse(content)
        setChatFiles(prev => [...prev, { name: file.name, content, type: 'chat' }])
      } catch {
        setError(`Invalid JSON file: ${file.name}`)
      }
    }

    // Reset input
    e.target.value = ''
  }, [])

  const removeChatFile = (index: number) => {
    setChatFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!studentName.trim()) {
      setError('Student name is required')
      return
    }

    if (chatFiles.length === 0) {
      setError('At least one chat export is required')
      return
    }

    setLoading(true)

    try {
      const res = await fetch(`/api/assignments/${assignmentId}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: studentName.trim(),
          chatExports: chatFiles.map(f => f.content),
          finalCode: codeContent.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create submission')
      }

      const submission = await res.json()
      router.push(`/assignments/${assignmentId}/submissions/${submission.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

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
              <h1 className="text-xl font-bold">Add Submission</h1>
              <p className="text-sm text-muted-foreground">Upload a student's chat export and code</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <form onSubmit={handleSubmit}>
          {/* Student Info */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle>Student Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="studentName">Student Name *</Label>
                <Input
                  id="studentName"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g., John Smith"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Chat Export Upload */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="w-5 h-5 text-violet-600" />
                Chat Export *
              </CardTitle>
              <CardDescription>
                Upload the ChatGPT JSON export file(s). Students can export their conversation from ChatGPT settings.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Uploaded files */}
              {chatFiles.length > 0 && (
                <div className="space-y-2 mb-4">
                  {chatFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium">{file.name}</span>
                        <Badge variant="outline" className="text-xs">JSON</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeChatFile(index)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload area */}
              <label className="block">
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-violet-400 hover:bg-violet-50/50 transition-colors cursor-pointer">
                  <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {chatFiles.length > 0 ? 'Add more chat files' : 'Upload chat export'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JSON files from ChatGPT export
                  </p>
                </div>
                <input
                  type="file"
                  accept=".json,application/json"
                  multiple
                  className="hidden"
                  onChange={handleChatUpload}
                />
              </label>
            </CardContent>
          </Card>

          {/* Code Submission */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-violet-600" />
                Final Code *
              </CardTitle>
              <CardDescription>
                Paste the student's final submitted code. This will be compared against AI-generated code to assess independence.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={codeContent}
                onChange={(e) => setCodeContent(e.target.value)}
                placeholder="Paste the student's final code here..."
                rows={15}
                className="font-mono text-sm"
              />
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg mb-6">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Link href={`/assignments/${assignmentId}`}>
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button
              type="submit"
              disabled={loading || !studentName.trim() || chatFiles.length === 0}
              className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
            >
              <Upload className="w-4 h-4 mr-2" />
              {loading ? 'Processing...' : 'Submit & Analyze'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
