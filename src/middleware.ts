import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple session verification in middleware
function verifySessionToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length !== 3) return false

    const [timestamp, , secret] = parts
    const expectedSecret = process.env.SESSION_SECRET || 'transcript-local-secret-key'
    if (secret !== expectedSecret) return false

    // Session expires after 24 hours
    const tokenTime = parseInt(timestamp, 10)
    const now = Date.now()
    const twentyFourHours = 24 * 60 * 60 * 1000

    return now - tokenTime < twentyFourHours
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow auth routes and static files
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Check for session cookie
  const sessionToken = request.cookies.get('transcript_session')

  if (!sessionToken || !verifySessionToken(sessionToken.value)) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
