'use client'

import { useMemo } from 'react'
import { diffLines, Change } from 'diff'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { analyzeModifications, type ModificationAnalysis } from '@/lib/analyzer/code-extractor'

interface CodeDiffProps {
  aiCode: string
  finalCode: string
  className?: string
}

function DiffLine({ change, lineNumber }: { change: Change; lineNumber: number }) {
  const lines = change.value.split('\n').filter((_, i, arr) => i < arr.length - 1 || change.value.slice(-1) !== '\n')

  return (
    <>
      {lines.map((line, i) => (
        <div
          key={`${lineNumber}-${i}`}
          className={cn(
            'font-mono text-sm px-4 py-0.5 flex',
            change.added && 'bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-300',
            change.removed && 'bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-300',
            !change.added && !change.removed && 'bg-slate-50 dark:bg-slate-800'
          )}
        >
          <span className="w-8 flex-shrink-0 text-muted-foreground text-xs text-right mr-4">
            {lineNumber + i}
          </span>
          <span className="w-4 flex-shrink-0 text-center">
            {change.added ? '+' : change.removed ? '-' : ' '}
          </span>
          <span className="flex-1 whitespace-pre overflow-x-auto">{line}</span>
        </div>
      ))}
    </>
  )
}

function ModificationSummary({ analysis }: { analysis: ModificationAnalysis }) {
  const getBadgeVariant = () => {
    switch (analysis.assessment) {
      case 'verbatim':
        return 'destructive'
      case 'minor-changes':
        return 'warning'
      case 'substantial-changes':
        return 'secondary'
      case 'significant-rewrite':
        return 'success'
      default:
        return 'outline'
    }
  }

  const getAssessmentText = () => {
    switch (analysis.assessment) {
      case 'verbatim':
        return 'Verbatim Copy'
      case 'minor-changes':
        return 'Minor Changes'
      case 'substantial-changes':
        return 'Substantial Changes'
      case 'significant-rewrite':
        return 'Significant Rewrite'
      default:
        return 'Unknown'
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 bg-muted/50 rounded-lg mb-4">
      <Badge variant={getBadgeVariant() as 'default'}>
        {getAssessmentText()}
      </Badge>
      <span className="text-sm text-muted-foreground">
        {Math.round(analysis.verbatimPercentage)}% unchanged
      </span>
      <span className="text-sm text-green-600">
        +{analysis.addedLines} added
      </span>
      <span className="text-sm text-red-600">
        -{analysis.removedLines} removed
      </span>
    </div>
  )
}

export function CodeDiff({ aiCode, finalCode, className }: CodeDiffProps) {
  const diff = useMemo(() => {
    return diffLines(aiCode, finalCode)
  }, [aiCode, finalCode])

  const analysis = useMemo(() => {
    return analyzeModifications(aiCode, finalCode)
  }, [aiCode, finalCode])

  let lineNumber = 1

  if (!aiCode && !finalCode) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <p>No code to compare</p>
      </div>
    )
  }

  if (!aiCode) {
    return (
      <div className={cn('', className)}>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
          <p className="text-sm text-yellow-800">
            No AI-generated code found in the chat. Showing final code only.
          </p>
        </div>
        <pre className="overflow-x-auto p-4 bg-slate-900 text-slate-100 rounded-lg text-sm">
          <code>{finalCode}</code>
        </pre>
      </div>
    )
  }

  if (!finalCode) {
    return (
      <div className={cn('', className)}>
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
          <p className="text-sm text-yellow-800">
            No final code submitted. Showing AI-generated code only.
          </p>
        </div>
        <pre className="overflow-x-auto p-4 bg-slate-900 text-slate-100 rounded-lg text-sm">
          <code>{aiCode}</code>
        </pre>
      </div>
    )
  }

  return (
    <div className={className}>
      <ModificationSummary analysis={analysis} />

      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
          <span className="text-sm font-medium">Code Comparison</span>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-red-200 rounded"></span>
              AI Code (removed)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-200 rounded"></span>
              Final Code (added)
            </span>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {diff.map((change, index) => {
            const component = (
              <DiffLine
                key={index}
                change={change}
                lineNumber={lineNumber}
              />
            )
            if (!change.removed) {
              lineNumber += change.value.split('\n').length - (change.value.endsWith('\n') ? 1 : 0)
            }
            return component
          })}
        </div>
      </div>
    </div>
  )
}
