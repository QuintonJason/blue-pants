import { NextRequest, NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    await clearSessionCookie()
    // Redirect to login page after logout, staying on whatever host/port served us
    return NextResponse.redirect(new URL('/login', request.url))
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    )
  }
}
