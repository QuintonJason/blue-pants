import { NextResponse } from 'next/server'
import { isPasswordSetup } from '@/lib/auth'

export async function GET() {
  try {
    const isSetup = await isPasswordSetup()
    return NextResponse.json({ isSetup })
  } catch (error) {
    console.error('Auth status error:', error)
    return NextResponse.json({ isSetup: false })
  }
}
