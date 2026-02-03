'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell
} from 'recharts'

interface SectionScore {
  score?: number
  max?: number
  percentage?: number
}

interface ResponseData {
  id: string
  respondent_name: string | null
  respondent_email: string | null
  respondent_company: string | null
  respondent_department: string | null
  respondent_role: string | null
  company_size: string | null
  overall_score: number
  section_scores: Record<string, number | SectionScore>
  open_responses: Record<string, string>
  answers: Record<string, number>
  completed_at: string
  created_at: string
}

const SECTION_INFO: Record<string, { name: string; icon: string; description: string }> = {
  work_changes: { name: 'When Work Changes', icon: '🧭', description: 'Clarity during transitions and announcements' },
  finding_info: { name: 'Finding Information', icon: '🔄', description: 'Access to information and message consistency' },
  speaking_up: { name: 'Speaking Up', icon: '💬', description: 'Psychological safety and feedback culture' },
  cross_team: { name: 'Working Across Teams', icon: '🧩', description: 'Cross-functional communication and alignment' },
  leadership: { name: 'Leadership Communication', icon: '👔', description: 'Leadership visibility and relevance' },
  during_change: { name: 'During Change', icon: '🔁', description: 'Communication during organizational change' },
  culture: { name: 'Everyday Communication', icon: '🌿', description: 'Daily communication norms and meeting effectiveness' },
  overload: { name: 'Communication Overload', icon: '⚖️', description: 'Volume management and clarity' }
}

// Convert section score to 1-4 value
const getSectionValue = (score: number | SectionScore | undefined): number | null => {
  if (score === undefined || score === null) return null
  if (typeof score === 'number') return score
  if (typeof score === 'object' && 'percentage' in score) return (score.percentage! / 100) * 4
  return null
}

// Score color based on 1-4 scale
const getScoreColor = (score: number | null) => {
  if (score === null) return '#9ca3af'
  if (score >= 3.5) return '#10b981' // Strong - green
  if (score >= 2.8) return '#f59e0b' // Functional - yellow
  if (score >= 2.0) return '#f97316' // Gaps - orange
  return '#ef4444' // Friction - red
}

const getScoreLabel = (score: number | null) => {
  if (score === null) return { label: 'N/A', color: 'text-gray-600', bg: 'bg-gray-100', desc: 'No data' }
  if (score >= 3.5) return { label: 'Strong', color: 'text-emerald-600', bg: 'bg-emerald-100', desc: 'Strong communication culture' }
  if (score >= 2.8) return { label: 'Functional', color: 'text-yellow-600', bg: 'bg-yellow-100', desc: 'Functional but inconsistent' }
  if (score >= 2.0) return { label: 'Gaps', color: 'text-orange-600', bg: 'bg-orange-100', desc: 'Communication gaps affecting performance' }
  return { label: 'Friction', color: 'text-red-600', bg: 'bg-red-100', desc: 'High communication friction' }
}

const generateInterpretation = (data: ResponseData) => {
  const scores = Object.entries(data.section_scores)
    .map(([key, val]) => ({ key, value: getSectionValue(val), info: SECTION_INFO[key] }))
    .filter(s => s.value !== null)
    .sort((a, b) => (a.value || 0) - (b.value || 0))
  
  const weakest = scores.slice(0, 2)
  const strongest = scores.slice(-2).reverse()
  const overall = getScoreLabel(data.overall_score)

  return {
    summary: `This assessment reveals an overall communication health score of ${data.overall_score.toFixed(2)} out of 4.0, indicating ${overall.desc.toLowerCase()}.`,
    strengths: strongest.map(s => ({
      area: s.info?.name || s.key,
      score: s.value!,
      insight: `${s.info?.name} scored ${s.value!.toFixed(2)}/4.0 - ${s.value! >= 3.5 ? 'excellent' : 'good'} in ${s.info?.description?.toLowerCase()}.`
    })),
    priorities: weakest.map(s => ({
      area: s.info?.name || s.key,
      score: s.value!,
      insight: `${s.info?.name} scored ${s.value!.toFixed(2)}/4.0, indicating opportunity for improvement.`,
      recommendation: getRecommendation(s.key)
    })),
    openFeedback: Object.values(data.open_responses || {}).filter(v => v && v.trim().length > 0)
  }
}

const getRecommendation = (key: string): string => {
  const recommendations: Record<string, string> = {
    work_changes: 'Implement clearer change communication protocols with specific action items.',
    finding_info: 'Establish a centralized information hub and standardize updates.',
    speaking_up: 'Create regular forums for open dialogue and demonstrate feedback leads to action.',
    cross_team: 'Implement cross-functional sync meetings and shared goal visibility.',
    leadership: 'Increase leadership visibility through regular updates connected to daily work.',
    during_change: 'Develop a change communication playbook with clear expectations.',
    culture: 'Review meeting effectiveness and establish direct communication norms.',
    overload: 'Audit communication channels and implement message prioritization.'
  }
  return recommendations[key] || 'Focus on improving communication practices in this area.'
}

export default function ResponseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<ResponseData | null>(null)
  const [loading, setLoading] = useState(true)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiLanguage, setAiLanguage] = useState<'en' | 'tr'>('en')
  const router = useRouter()

  useEffect(() => {
    const isAuth = localStorage.getItem('ttc_admin_auth')
    if (isAuth !== 'true') {
      router.push('/admin')
      return
    }
    fetchData()
  }, [id, router])

  const fetchData = async () => {
    const { data: response } = await supabase
      .from('ttc_responses')
      .select('*')
      .eq('id', id)
      .single()
    if (response) setData(response)
    setLoading(false)
  }

  const generateAIAnalysis = async () => {
    if (!data) return
    setAiLoading(true)
    setAiAnalysis(null)

    try {
      // Convert section scores to 1-4 scale
      const sectionScores: Record<string, number> = {}
      Object.entries(data.section_scores).forEach(([key, val]) => {
        const score = getSectionValue(val)
        if (score !== null) sectionScores[key] = score
      })

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'individual',
          language: aiLanguage,
          data: {
            overallScore: data.overall_score,
            department: data.respondent_department || undefined,
            role: data.respondent_role || undefined,
            sectionScores,
            openFeedback: Object.values(data.open_responses || {}).filter(v => v?.trim())
          }
        })
      })

      const result = await response.json()
      if (result.error) {
        setAiAnalysis(`Error: ${result.error}`)
      } else {
        setAiAnalysis(result.analysis)
      }
    } catch (error) {
      setAiAnalysis(`Error: ${error instanceof Error ? error.message : 'Failed to generate analysis'}`)
    }

    setAiLoading(false)
  }

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div></div>
  }

  if (!data) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p>Response not found</p></div>
  }

  const interpretation = generateInterpretation(data)
  const scoreInfo = getScoreLabel(data.overall_score)

  // Prepare chart data
  const radarData = Object.entries(data.section_scores).map(([key, value]) => ({
    subject: SECTION_INFO[key]?.name || key,
    score: (getSectionValue(value) || 0) / 4 * 100, // Convert to percentage for radar
    fullMark: 100
  }))

  const barData = Object.entries(data.section_scores)
    .map(([key, value]) => ({
      name: SECTION_INFO[key]?.name || key,
      score: getSectionValue(value) || 0,
      color: getScoreColor(getSectionValue(value))
    }))
    .sort((a, b) => b.score - a.score)

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b print:hidden">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="text-slate-500 hover:text-slate-700">← Back</Link>
            <div className="h-6 w-px bg-slate-200"></div>
            <h1 className="font-bold text-gray-900">Response Details</h1>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/analytics" className="text-blue-600 hover:text-blue-800 text-sm font-medium">📊 Analytics</Link>
            <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium">Print Report</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Respondent Info */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Respondent Information</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-gray-500">Name</p><p className="font-medium">{data.respondent_name || 'Anonymous'}</p></div>
            <div><p className="text-gray-500">Email</p><p className="font-medium">{data.respondent_email || '-'}</p></div>
            <div><p className="text-gray-500">Company</p><p className="font-medium">{data.respondent_company || '-'}</p></div>
            <div><p className="text-gray-500">Department</p><p className="font-medium">{data.respondent_department || '-'}</p></div>
            <div><p className="text-gray-500">Role</p><p className="font-medium">{data.respondent_role || '-'}</p></div>
            <div><p className="text-gray-500">Company Size</p><p className="font-medium">{data.company_size || '-'}</p></div>
            <div><p className="text-gray-500">Submitted</p><p className="font-medium">{new Date(data.completed_at).toLocaleString()}</p></div>
          </div>
        </div>

        {/* Overall Score */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-6 text-center">
          <h2 className="font-semibold text-gray-900 mb-6">Communication Health Score</h2>
          <div className="relative inline-flex items-center justify-center">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle cx="80" cy="80" r="70" stroke="#e5e7eb" strokeWidth="12" fill="none" />
              <circle cx="80" cy="80" r="70" stroke={getScoreColor(data.overall_score)} strokeWidth="12" fill="none" strokeLinecap="round" strokeDasharray={2 * Math.PI * 70} strokeDashoffset={2 * Math.PI * 70 * (1 - data.overall_score / 4)} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-gray-900">{data.overall_score.toFixed(2)}</span>
              <span className="text-sm text-gray-500">out of 4.0</span>
              <span className={`text-sm font-medium px-3 py-1 rounded-full mt-2 ${scoreInfo.bg} ${scoreInfo.color}`}>{scoreInfo.label}</span>
            </div>
          </div>
          <p className="text-gray-600 mt-4 max-w-md mx-auto">{scoreInfo.desc}</p>
        </div>

        {/* Heat Map */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Section Scores Heat Map</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(data.section_scores).map(([key, value]) => {
              const score = getSectionValue(value)
              return (
                <div key={key} className="p-4 rounded-lg text-center" style={{ backgroundColor: `${getScoreColor(score)}20` }}>
                  <span className="text-2xl block mb-2">{SECTION_INFO[key]?.icon}</span>
                  <p className="text-xs text-gray-600 mb-1">{SECTION_INFO[key]?.name}</p>
                  <p className="text-xl font-bold" style={{ color: getScoreColor(score) }}>{score?.toFixed(2) || '-'}</p>
                  <p className="text-xs text-gray-500">{getScoreLabel(score).label}</p>
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Radar Chart */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Overview</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <Radar name="Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Bar Chart */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Section Breakdown</h2>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ left: 100 }}>
                  <XAxis type="number" domain={[0, 4]} tick={{ fill: '#6b7280' }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: '#374151', fontSize: 11 }} width={95} />
                  <Tooltip formatter={(value) => [`${Number(value).toFixed(2)}`, 'Score']} />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {barData.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Quick Summary */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Quick Summary</h2>
          <p className="text-gray-700 mb-6">{interpretation.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-emerald-700 mb-2">Strengths</h3>
              {interpretation.strengths.map((s, i) => (
                <div key={i} className="flex justify-between items-center bg-emerald-50 rounded-lg p-3 mb-2">
                  <span className="text-sm text-emerald-800">{s.area}</span>
                  <span className="text-emerald-600 font-bold text-sm">{s.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-medium text-orange-700 mb-2">Priority Areas</h3>
              {interpretation.priorities.map((p, i) => (
                <div key={i} className="flex justify-between items-center bg-orange-50 rounded-lg p-3 mb-2">
                  <span className="text-sm text-orange-800">{p.area}</span>
                  <span className="text-orange-600 font-bold text-sm">{p.score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Analysis */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-sm p-6 mb-6 border border-blue-100">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-xl">🤖</span> Gemini AI Analysis
            </h2>
            <div className="flex items-center gap-3">
              <select
                value={aiLanguage}
                onChange={(e) => setAiLanguage(e.target.value as 'en' | 'tr')}
                className="px-3 py-1 border rounded-lg text-sm bg-white"
              >
                <option value="en">English</option>
                <option value="tr">Turkce</option>
              </select>
              <button
                onClick={generateAIAnalysis}
                disabled={aiLoading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Analyzing...
                  </>
                ) : (
                  <>Generate AI Analysis</>
                )}
              </button>
            </div>
          </div>

          {aiAnalysis ? (
            <div className="bg-white rounded-lg p-4 prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap text-gray-700">{aiAnalysis}</div>
            </div>
          ) : (
            <p className="text-gray-500 text-sm">
              Click "Generate AI Analysis" to get a detailed analysis of this response using Gemini AI.
            </p>
          )}
        </div>

        {/* Open Responses */}
        {interpretation.openFeedback.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-4">📝 Open Feedback</h2>
            <div className="space-y-4">
              {interpretation.openFeedback.map((feedback, i) => (
                <div key={i} className="bg-slate-50 rounded-lg p-4">
                  <p className="text-gray-700 italic">"{feedback}"</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score Legend */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="font-medium text-gray-900 mb-4">Score Guide (out of 4.0)</h3>
          <div className="grid grid-cols-4 gap-4 text-center text-sm">
            <div className="p-3 bg-emerald-50 rounded-lg"><div className="w-3 h-3 bg-emerald-500 rounded-full mx-auto mb-2"></div><p className="font-medium text-emerald-700">3.5-4.0</p><p className="text-xs text-emerald-600">Strong</p></div>
            <div className="p-3 bg-yellow-50 rounded-lg"><div className="w-3 h-3 bg-yellow-500 rounded-full mx-auto mb-2"></div><p className="font-medium text-yellow-700">2.8-3.4</p><p className="text-xs text-yellow-600">Functional</p></div>
            <div className="p-3 bg-orange-50 rounded-lg"><div className="w-3 h-3 bg-orange-500 rounded-full mx-auto mb-2"></div><p className="font-medium text-orange-700">2.0-2.7</p><p className="text-xs text-orange-600">Gaps</p></div>
            <div className="p-3 bg-red-50 rounded-lg"><div className="w-3 h-3 bg-red-500 rounded-full mx-auto mb-2"></div><p className="font-medium text-red-700">0-1.9</p><p className="text-xs text-red-600">Friction</p></div>
          </div>
        </div>
      </div>
    </main>
  )
}
