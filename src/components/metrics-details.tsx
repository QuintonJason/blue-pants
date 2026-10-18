'use client'

import {
  MessageSquare,
  HelpCircle,
  Code,
  Bug,
  RefreshCw,
  AlertTriangle,
  FileText,
  Hand,
  Download,
  EyeOff
} from 'lucide-react'
import type { ComputedMetrics } from '@/lib/db/schema'

interface MetricsDetailsProps {
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

/**
 * The raw counts behind the AI-use summary. Shown inside the summary card rather
 * than as a panel of its own, since the summary already says what they mean.
 */
export function MetricsDetails({ metrics, className }: MetricsDetailsProps) {
  const questionRate = metrics.userMessages > 0
    ? Math.round((metrics.questionCount / metrics.userMessages) * 100)
    : 0

  const shortPromptRate = metrics.userMessages > 0
    ? Math.round((metrics.shortPromptCount / metrics.userMessages) * 100)
    : 0

  return (
    <div className={className ?? 'grid sm:grid-cols-2 gap-2'}>
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

      {(metrics.delegationCount ?? 0) > 0 && (
        <MetricItem
          icon={<Hand className="w-4 h-4 text-red-500" />}
          label="Hand-offs"
          value={metrics.delegationCount ?? 0}
          description="Whole features, pages or files requested from the AI"
          variant={(metrics.delegationCount ?? 0) >= 3 ? 'danger' : 'warning'}
        />
      )}

      {(metrics.aiCodeDownloads ?? 0) > 0 && (
        <MetricItem
          icon={<Download className="w-4 h-4 text-amber-500" />}
          label="AI Code Downloads"
          value={metrics.aiCodeDownloads ?? 0}
          description="Code files the AI handed over; not in the transcript, so the code comparison can't see them"
          variant="warning"
        />
      )}

      {(metrics.offTopicCount ?? 0) > 0 && (
        <MetricItem
          icon={<EyeOff className="w-4 h-4 text-muted-foreground" />}
          label="Off-topic Requests"
          value={metrics.offTopicCount ?? 0}
          description="Image or writing requests, left out of the counts above"
        />
      )}
    </div>
  )
}
