'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  MessageSquare,
  HelpCircle,
  Code,
  Bug,
  RefreshCw,
  AlertTriangle,
  FileText
} from 'lucide-react'
import type { ComputedMetrics } from '@/lib/db/schema'

interface MetricsPanelProps {
  metrics: ComputedMetrics
  className?: string
}

interface MetricItemProps {
  icon: React.ReactNode
  label: string
  value: number | string
  description?: string
  variant?: 'default' | 'success' | 'warning' | 'danger'
}

function MetricItem({ icon, label, value, description, variant = 'default' }: MetricItemProps) {
  const variantColors = {
    default: 'text-slate-600',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50/50">
      <div className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className={`font-semibold ${variantColors[variant]}`}>{value}</span>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  )
}

export function MetricsPanel({ metrics, className }: MetricsPanelProps) {
  // Calculate some derived metrics
  const messageRatio = metrics.userMessages > 0
    ? (metrics.assistantMessages / metrics.userMessages).toFixed(1)
    : 'N/A'

  const questionRate = metrics.userMessages > 0
    ? Math.round((metrics.questionCount / metrics.userMessages) * 100)
    : 0

  const shortPromptRate = metrics.userMessages > 0
    ? Math.round((metrics.shortPromptCount / metrics.userMessages) * 100)
    : 0

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Chat Metrics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Conversation Stats */}
        <MetricItem
          icon={<MessageSquare className="w-4 h-4 text-violet-600" />}
          label="Total Messages"
          value={metrics.totalMessages}
          description={`${metrics.userMessages} student / ${metrics.assistantMessages} AI`}
        />

        <MetricItem
          icon={<HelpCircle className="w-4 h-4 text-blue-600" />}
          label="Questions Asked"
          value={metrics.questionCount}
          description={`${questionRate}% of messages`}
          variant={questionRate > 30 ? 'success' : questionRate > 10 ? 'default' : 'warning'}
        />

        <MetricItem
          icon={<RefreshCw className="w-4 h-4 text-green-600" />}
          label="Iterations"
          value={metrics.iterationCount}
          description="Follow-up refinements"
          variant={metrics.iterationCount >= 3 ? 'success' : metrics.iterationCount >= 1 ? 'default' : 'warning'}
        />

        <MetricItem
          icon={<Code className="w-4 h-4 text-orange-600" />}
          label="Code Blocks"
          value={metrics.codeBlockCount}
          description={metrics.userCodeBlocks > 0 ? `${metrics.userCodeBlocks} from student` : 'All from AI'}
        />

        <MetricItem
          icon={<Bug className="w-4 h-4 text-amber-600" />}
          label="Error Discussions"
          value={metrics.errorMentions}
          description="Debugging conversations"
          variant={metrics.errorMentions > 0 ? 'success' : 'default'}
        />

        <MetricItem
          icon={<FileText className="w-4 h-4 text-slate-600" />}
          label="Avg Prompt Length"
          value={`${metrics.averagePromptLength} chars`}
          description={metrics.longPromptCount > 0 ? `${metrics.longPromptCount} detailed prompts` : ''}
          variant={metrics.averagePromptLength > 150 ? 'success' : metrics.averagePromptLength > 75 ? 'default' : 'warning'}
        />

        {metrics.shortPromptCount > 0 && (
          <MetricItem
            icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
            label="Short Prompts"
            value={metrics.shortPromptCount}
            description={`${shortPromptRate}% of messages`}
            variant={shortPromptRate > 30 ? 'danger' : shortPromptRate > 15 ? 'warning' : 'default'}
          />
        )}

        {/* Quick Assessment */}
        <div className="pt-3 mt-3 border-t">
          <div className="text-sm font-medium mb-2">Quick Assessment</div>
          <div className="flex flex-wrap gap-2">
            {metrics.questionCount === 0 && (
              <Badge variant="destructive">No Questions</Badge>
            )}
            {metrics.iterationCount === 0 && metrics.userMessages > 1 && (
              <Badge variant="destructive">No Iterations</Badge>
            )}
            {metrics.userMessages === 1 && (
              <Badge variant="destructive">One-Shot</Badge>
            )}
            {shortPromptRate > 30 && (
              <Badge variant="warning">Many Short Prompts</Badge>
            )}
            {metrics.questionCount > 3 && (
              <Badge variant="success">Good Questions</Badge>
            )}
            {metrics.iterationCount >= 3 && (
              <Badge variant="success">Good Iterations</Badge>
            )}
            {metrics.errorMentions > 0 && (
              <Badge variant="success">Debugging</Badge>
            )}
            {metrics.userCodeBlocks > 0 && (
              <Badge variant="success">Shared Code</Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
