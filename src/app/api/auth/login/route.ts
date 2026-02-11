import { NextResponse } from 'next/server'
import { verifyLogin, setSessionCookie } from '@/lib/auth'
import { initializeDatabase } from '@/lib/db'

export async function POST(request: Request) {
  try {
    initializeDatabase()

    const { password } = await request.json()

    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      )
    }

    const valid = await verifyLogin(password)
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      )
    }

    await setSessionCookie()
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    )
  }
}
