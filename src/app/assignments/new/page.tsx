'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { ArrowLeft, Save } from 'lucide-react'
import { DEFAULT_RUBRIC_CONFIG } from '@/lib/scorer/rubric'
import type { RubricConfig } from '@/lib/db/schema'

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

export default function NewAssignmentPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rubricConfig, setRubricConfig] = useState<RubricConfig>(DEFAULT_RUBRIC_CONFIG)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const totalWeight = Object.values(rubricConfig).reduce((sum, w) => sum + w, 0)

  const handleWeightChange = (key: keyof RubricConfig, value: number[]) => {
    setRubricConfig(prev => ({ ...prev, [key]: value[0] }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, rubricConfig }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create assignment')
      }

      const assignment = await res.json()
      router.push(`/assignments/${assignment.id}`)
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
            <Link href="/assignments">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold">New Assignment</h1>
              <p className="text-sm text-muted-foreground">Create a new assignment with custom rubric</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <form onSubmit={handleSubmit}>
          {/* Basic Info */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle>Assignment Details</CardTitle>
              <CardDescription>Basic information about the assignment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Assignment Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Lab 3: Binary Search Tree"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description of the assignment..."
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
                Configure how much each dimension contributes to the score.
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
                    className="w-full"
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg mb-6">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Link href="/assignments">
              <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button
              type="submit"
              disabled={loading || !name.trim()}
              className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Creating...' : 'Create Assignment'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  )
}
