const GEMINI_API_KEY = process.env.GEMINI_API_KEY

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[]
    }
  }[]
}

export interface AnalysisRequest {
  type: 'individual' | 'company'
  language: 'en' | 'tr'
  customPrompt?: string
  data: {
    overallScore: number
    sectionScores: Record<string, number>
    department?: string
    role?: string
    companyName?: string
    openFeedback?: string[]
    // For company reports
    totalResponses?: number
    departmentBreakdown?: Record<string, { count: number; avgScore: number }>
    roleBreakdown?: Record<string, { count: number; avgScore: number }>
    perceptionGaps?: { from: string; to: string; gap: number }[]
  }
}

const DEFAULT_PROMPTS = {
  individual: {
    en: `You are an organizational communication expert analyzing survey results.
Analyze the following Communication Health Check results and provide:
1. Executive Summary (2-3 sentences)
2. Top 2 Strengths with specific observations
3. Top 2 Priority Areas with actionable recommendations
4. One key insight about communication patterns

Score interpretation (out of 4.0):
- 3.5-4.0: Strong - Excellent communication culture
- 2.8-3.4: Functional - Working but inconsistent
- 2.0-2.7: Gaps - Communication issues affecting performance
- Below 2.0: Friction - High communication friction

Be specific, actionable, and constructive. Format with clear headings.`,
    tr: `Bir organizasyonel iletişim uzmanı olarak anket sonuçlarını analiz ediyorsunuz.
Aşağıdaki İletişim Sağlığı Kontrolü sonuçlarını analiz edin ve şunları sağlayın:
1. Yönetici Özeti (2-3 cümle)
2. Spesifik gözlemlerle En İyi 2 Güçlü Yön
3. Uygulanabilir önerilerle 2 Öncelikli Alan
4. İletişim kalıpları hakkında bir temel içgörü

Skor yorumlama (4.0 üzerinden):
- 3.5-4.0: Güçlü - Mükemmel iletişim kültürü
- 2.8-3.4: Fonksiyonel - Çalışıyor ama tutarsız
- 2.0-2.7: Boşluklar - Performansı etkileyen iletişim sorunları
- 2.0'ın altı: Sürtüşme - Yüksek iletişim sürtüşmesi

Spesifik, uygulanabilir ve yapıcı olun. Net başlıklarla formatlayın.`
  },
  company: {
    en: `You are an organizational communication consultant preparing a comprehensive company report.
Analyze the following company-wide Communication Health Check data and provide:
1. Executive Summary (overall health assessment)
2. Departmental Analysis (identify best and worst performing departments)
3. Role-Based Insights (compare leadership vs staff perceptions)
4. Key Perception Gaps (where leaders and staff see things differently)
5. Top 3 Strategic Recommendations for leadership
6. Quick Wins (immediate actions that can improve communication)

Be data-driven, cite specific scores, and provide actionable insights.`,
    tr: `Kapsamlı bir şirket raporu hazırlayan bir organizasyonel iletişim danışmanısınız.
Aşağıdaki şirket geneli İletişim Sağlığı Kontrolü verilerini analiz edin ve şunları sağlayın:
1. Yönetici Özeti (genel sağlık değerlendirmesi)
2. Departman Analizi (en iyi ve en kötü performans gösteren departmanları belirleyin)
3. Rol Bazlı İçgörüler (liderlik ve personel algılarını karşılaştırın)
4. Temel Algı Boşlukları (liderler ve personelin farklı gördüğü yerler)
5. Liderlik için En İyi 3 Stratejik Öneri
6. Hızlı Kazanımlar (iletişimi iyileştirebilecek acil eylemler)

Veri odaklı olun, belirli skorlara atıfta bulunun ve uygulanabilir içgörüler sağlayın.`
  }
}

export const getDefaultPrompt = (type: 'individual' | 'company', language: 'en' | 'tr'): string => {
  return DEFAULT_PROMPTS[type][language]
}

export async function generateAnalysis(request: AnalysisRequest): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured')
  }

  const basePrompt = request.customPrompt || getDefaultPrompt(request.type, request.language)

  let dataSection = ''

  if (request.type === 'individual') {
    dataSection = `
DATA TO ANALYZE:
- Overall Score: ${request.data.overallScore.toFixed(2)}/4.0
- Department: ${request.data.department || 'Not specified'}
- Role: ${request.data.role || 'Not specified'}

Section Scores (out of 4.0):
${Object.entries(request.data.sectionScores)
  .map(([key, val]) => `- ${formatSectionName(key)}: ${val.toFixed(2)}`)
  .join('\n')}

${request.data.openFeedback && request.data.openFeedback.length > 0
  ? `Open Feedback:\n${request.data.openFeedback.map(f => `- "${f}"`).join('\n')}`
  : ''}`
  } else {
    dataSection = `
COMPANY DATA TO ANALYZE:
- Company: ${request.data.companyName || 'Not specified'}
- Total Responses: ${request.data.totalResponses}
- Overall Average Score: ${request.data.overallScore.toFixed(2)}/4.0

Section Averages (out of 4.0):
${Object.entries(request.data.sectionScores)
  .map(([key, val]) => `- ${formatSectionName(key)}: ${val.toFixed(2)}`)
  .join('\n')}

${request.data.departmentBreakdown ? `
Department Breakdown:
${Object.entries(request.data.departmentBreakdown)
  .map(([dept, data]) => `- ${dept}: ${data.avgScore.toFixed(2)}/4.0 (${data.count} responses)`)
  .join('\n')}` : ''}

${request.data.roleBreakdown ? `
Role Breakdown:
${Object.entries(request.data.roleBreakdown)
  .map(([role, data]) => `- ${role}: ${data.avgScore.toFixed(2)}/4.0 (${data.count} responses)`)
  .join('\n')}` : ''}

${request.data.perceptionGaps && request.data.perceptionGaps.length > 0 ? `
Perception Gaps:
${request.data.perceptionGaps
  .map(g => `- ${g.from} vs ${g.to}: ${g.gap > 0 ? '+' : ''}${g.gap.toFixed(2)} gap`)
  .join('\n')}` : ''}`
  }

  const fullPrompt = `${basePrompt}\n\n${dataSection}`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  const result: GeminiResponse = await response.json()

  if (!result.candidates || result.candidates.length === 0) {
    throw new Error('No response from Gemini')
  }

  return result.candidates[0].content.parts[0].text
}

function formatSectionName(key: string): string {
  const names: Record<string, string> = {
    work_changes: 'When Work Changes',
    finding_info: 'Finding Information',
    speaking_up: 'Speaking Up',
    cross_team: 'Working Across Teams',
    leadership: 'Leadership Communication',
    during_change: 'During Change',
    culture: 'Everyday Communication',
    overload: 'Communication Overload'
  }
  return names[key] || key
}
