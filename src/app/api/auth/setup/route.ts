import { NextResponse } from 'next/server'
import { setupPassword, setSessionCookie, isPasswordSetup } from '@/lib/auth'
import { initializeDatabase } from '@/lib/db'

export async function POST(request: Request) {
  try {
    initializeDatabase()

    const { password } = await request.json()

    if (!password || password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if already set up
    const alreadySetup = await isPasswordSetup()
    if (alreadySetup) {
      return NextResponse.json(
        { error: 'Password already configured. Use login instead.' },
        { status: 400 }
      )
    }

    await setupPassword(password)
    await setSessionCookie()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      { error: 'Setup failed' },
      { status: 500 }
    )
  }
}
