import { NextRequest, NextResponse } from 'next/server'
import { generateAnalysis, AnalysisRequest } from '@/lib/gemini'

export async function POST(request: NextRequest) {
  try {
    const body: AnalysisRequest = await request.json()

    if (!body.type || !body.language || !body.data) {
      return NextResponse.json(
        { error: 'Missing required fields: type, language, data' },
        { status: 400 }
      )
    }

    const analysis = await generateAnalysis(body)

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('AI Analysis error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate analysis' },
      { status: 500 }
    )
  }
}
