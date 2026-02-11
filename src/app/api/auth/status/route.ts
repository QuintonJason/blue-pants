import { NextResponse } from 'next/server'
import { isPasswordSetup } from '@/lib/auth'
import { initializeDatabase } from '@/lib/db'

export async function GET() {
  try {
    // Initialize database on first request
    initializeDatabase()

    const isSetup = await isPasswordSetup()
    return NextResponse.json({ isSetup })
  } catch (error) {
    console.error('Auth status error:', error)
    return NextResponse.json({ isSetup: false })
  }
}
