import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function POST() {
  try {
    await clearSessionCookie()
    // Redirect to login page after logout
    return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'))
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}
