'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Lock, KeyRound } from 'lucide-react'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSetup, setIsSetup] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // Check if password is already set up
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => setIsSetup(data.isSetup))
      .catch(() => setIsSetup(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!isSetup) {
        // Setup mode - creating new password
        if (password !== confirmPassword) {
          setError('Passwords do not match')
          setLoading(false)
          return
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters')
          setLoading(false)
          return
        }

        const res = await fetch('/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Setup failed')
        }
      } else {
        // Login mode
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Login failed')
        }
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  if (isSetup === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50 to-slate-100">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-violet-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-white shadow-lg shadow-violet-500/25 mb-4">
            <FileText className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-violet-600 to-violet-800 bg-clip-text text-transparent">
            Transcript
          </h1>
          <p className="text-muted-foreground mt-1">
            AI Collaboration Assessment
          </p>
        </div>

        <Card className="border-0 shadow-xl shadow-slate-200/50">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center mb-2">
              {isSetup ? (
                <Lock className="w-5 h-5 text-violet-600" />
              ) : (
                <KeyRound className="w-5 h-5 text-violet-600" />
              )}
            </div>
            <CardTitle className="text-xl">
              {isSetup ? 'Welcome Back' : 'First Time Setup'}
            </CardTitle>
            <CardDescription>
              {isSetup
                ? 'Enter your password to continue'
                : 'Create a password to secure your data'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isSetup ? 'Enter password' : 'Create password'}
                  required
                  autoFocus
                />
              </div>

              {!isSetup && (
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    required
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-600 hover:to-violet-700"
                disabled={loading}
              >
                {loading ? 'Please wait...' : isSetup ? 'Sign In' : 'Create Password'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Your data is stored locally and protected by your password.
        </p>
      </div>
    </div>
  )
}
