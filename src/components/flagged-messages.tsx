'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Flag } from 'lucide-react'
import { flaggedMessages, type IntentKind, type IntentOverrides } from '@/lib/analyzer/intent-overrides'
import type { ParsedChat } from '@/lib/parser/chatgpt'
import type { Submission } from '@/lib/db/schema'

const KIND_COPY: Record<IntentKind, { label: string; counts: string; overrule: string; restore: string }> = {
  delegation: {
    label: 'Hand-off',
    counts: 'Costs 5 points of Independence',
    overrule: 'Not a hand-off',
    restore: 'Count as a hand-off',
  },
  offTopic: {
    label: 'Off-topic',
    counts: 'Left out of scoring',
    overrule: 'About the code',
    restore: 'Mark off-topic',
  },
}

const QUOTE_MAX = 140

interface FlaggedMessagesProps {
  submissionId: number
  /** The transcript as stored, without rulings applied. */
  chats: ParsedChat[]
  overrides: IntentOverrides
  onUpdated: (submission: Submission) => void
  onQuoteClick?: (anchor: string) => void
  className?: string
}

/**
 * Every message the wording rules flagged as a hand-off or off-topic, so the
 * teacher can see exactly what moved the score and overrule any flag they
 * disagree with. The suggestion and summary update with each ruling.
 */
export function FlaggedMessages({ submissionId, chats, overrides, onUpdated, onQuoteClick, className }: FlaggedMessagesProps) {
  const flagged = useMemo(() => flaggedMessages(chats, overrides), [chats, overrides])
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')

  const rule = async (anchor: string, kind: IntentKind, value: boolean) => {
    setSaving(`${anchor}:${kind}`)
    setError('')
    try {
      const res = await fetch(`/api/submissions/${submissionId}/intent-overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchor, kind, value }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save the ruling')
      onUpdated(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the ruling')
    } finally {
      setSaving(null)
    }
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Flag className="w-4 h-4" />
          Flagged messages
        </CardTitle>
        <CardDescription>
          Found by wording, so check each one. Overrule any you disagree with and the
          suggestion updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {flagged.length === 0 && <p className="text-sm text-muted-foreground">Nothing was flagged.</p>}
        {flagged.map(message => {
          const kinds = (Object.keys(KIND_COPY) as IntentKind[]).filter(
            kind => message.detected[kind] || message.counted[kind] || message.ruling?.[kind] !== undefined
          )
          const text = message.text.length > QUOTE_MAX ? `${message.text.slice(0, QUOTE_MAX)}…` : message.text
          return (
            <div key={message.anchor} className="rounded-lg border p-3 space-y-2">
              {onQuoteClick ? (
                <button
                  type="button"
                  onClick={() => onQuoteClick(message.anchor)}
                  className="text-left text-xs italic text-muted-foreground hover:text-violet-700 hover:underline break-words focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded-sm"
                  title="Show in chat"
                >
                  &ldquo;{text}&rdquo;
                </button>
              ) : (
                <p className="text-xs italic text-muted-foreground break-words">&ldquo;{text}&rdquo;</p>
              )}
              {kinds.map(kind => {
                const copy = KIND_COPY[kind]
                const counts = message.counted[kind]
                const overruled = message.ruling?.[kind] !== undefined
                return (
                  <div key={kind} className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant={counts ? 'secondary' : 'outline'} className={counts ? '' : 'line-through'}>
                        {copy.label}
                      </Badge>
                      <span className="text-muted-foreground">
                        {overruled ? (counts ? 'Ruled so by you' : 'Overruled by you') : counts ? copy.counts : 'Not counted'}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={saving !== null}
                      onClick={() => rule(message.anchor, kind, !counts)}
                    >
                      {saving === `${message.anchor}:${kind}` ? 'Saving…' : counts ? copy.overrule : copy.restore}
                    </Button>
                  </div>
                )
              })}
            </div>
          )
        })}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
