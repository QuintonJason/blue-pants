'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Separator } from '@/components/ui/separator'
import {
  ArrowLeft,
  Save,
  Trash2,
  AlertTriangle
} from 'lucide-react'
import { DEFAULT_RUBRIC_CONFIG } from '@/lib/scorer/rubric'
import type { RubricConfig, Assignment } from '@/lib/db/schema'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

const DIMENSION_LABELS: Record<keyof RubricConfig, { label: string; description: string }> = {
  problemArticulation: {
    label: 'Problem Articulation',
    description: 'How clearly they describe their needs with context and constraints',
  },
  iterationQuality: {
    label: 'Iteration Quality',
    description: 'Whether they refine prompts based on AI responses',
  },
  criticalEvaluation: {
    label: 'Critical Evaluation',
    description: 'Asking "why" questions and understanding AI suggestions',
  },
  codeReviewEngagement: {
    label: 'Code Review Engagement',
    description: 'Quality of code review requests and feedback processing',
  },
  debuggingProcess: {
    label: 'Debugging Process',
    description: 'Working through errors and issues with AI assistance',
  },
  independenceShown: {
    label: 'Independence Shown',
    description: 'Modifying AI code vs. accepting verbatim',
  },
}

export default function AssignmentSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const assignmentId = params.id

  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rubricConfig, setRubricConfig] = useState<RubricConfig>(DEFAULT_RUBRIC_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/assignments/${assignmentId}`)
      .then(res => res.json())
      .then(data => {
        setAssignment(data)
        setName(data.name)
        setDescription(data.description || '')
        setRubricConfig(JSON.parse(data.rubricConfig))
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load assignment')
        setLoading(false)
      })
  }, [assignmentId])

  const totalWeight = Object.values(rubricConfig).reduce((sum, w) => sum + w, 0)

  const handleWeightChange = (key: keyof RubricConfig, value: number[]) => {
    setRubricConfig(prev => ({ ...prev, [key]: value[0] }))
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, rubricConfig }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update assignment')
      }

      router.push(`/assignments/${assignmentId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Failed to delete assignment')
      }

      router.push('/assignments')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
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
              <h1 className="text-xl font-bold">Assignment Settings</h1>
              <p className="text-sm text-muted-foreground">Edit assignment details and rubric</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Basic Info */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <CardTitle>Assignment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Assignment Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Lab 3: Binary Search Tree"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Rubric Configuration */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader>
            <CardTitle>Rubric Weights</CardTitle>
            <CardDescription>
              Total: <span className={totalWeight === 100 ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}>
                {totalWeight}%
              </span>
              {totalWeight !== 100 && ' (should be 100%)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(Object.keys(DIMENSION_LABELS) as Array<keyof RubricConfig>).map((key) => (
              <div key={key} className="space-y-2">
                <div className="flex justify-between">
                  <div>
                    <Label>{DIMENSION_LABELS[key].label}</Label>
                    <p className="text-xs text-muted-foreground">{DIMENSION_LABELS[key].description}</p>
                  </div>
                  <span className="text-sm font-medium text-violet-600 tabular-nums">
                    {rubricConfig[key]}%
                  </span>
                </div>
                <Slider
                  value={[rubricConfig[key]]}
                  onValueChange={(v) => handleWeightChange(key, v)}
                  max={50}
                  step={5}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-0 shadow-lg border-destructive/20 mb-6">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Assignment</p>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete the assignment and all its submissions.
                </p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      Delete Assignment?
                    </DialogTitle>
                    <DialogDescription>
                      This action cannot be undone. This will permanently delete the assignment
                      &quot;{name}&quot; and all its submissions.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline">Cancel</Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? 'Deleting...' : 'Delete Assignment'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg mb-6">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Link href={`/assignments/${assignmentId}`}>
            <Button variant="outline">Cancel</Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </main>
    </div>
  )
}
