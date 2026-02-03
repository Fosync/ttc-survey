'use client'

import { useEffect, useState, use } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell
} from 'recharts'

interface SectionScore {
  score: number
  max: number
  percentage: number
}

interface ResponseResult {
  id: string
  completed_at: string
  overall_score: number
  section_scores: Record<string, SectionScore>
}

const SECTION_NAMES: Record<string, string> = {
  work_changes: 'When Work Changes',
  finding_info: 'Finding Information',
  speaking_up: 'Speaking Up',
  cross_team: 'Working Across Teams',
  leadership: 'Leadership Communication',
  overload: 'Communication Overload',
  during_change: 'During Change',
  culture: 'Communication Culture',
  open_feedback: 'Final Reflections'
}

const getScoreColor = (percentage: number) => {
  if (percentage >= 75) return '#10b981'
  if (percentage >= 50) return '#f59e0b'
  return '#ef4444'
}

const getScoreLabel = (percentage: number) => {
  if (percentage >= 75) return { label: 'Healthy', color: 'text-emerald-600', bg: 'bg-emerald-100' }
  if (percentage >= 50) return { label: 'Developing', color: 'text-amber-600', bg: 'bg-amber-100' }
  return { label: 'Needs Attention', color: 'text-red-600', bg: 'bg-red-100' }
}

export default function ResultsPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = use(params)
  const [result, setResult] = useState<ResponseResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchResults() {
      const { data, error } = await supabase
        .from('ttc_responses')
        .select('*')
        .eq('id', assessmentId)
        .single()

      if (error) {
        console.error('Error fetching results:', error)
        setLoading(false)
        return
      }

      setResult(data)
      setLoading(false)
    }

    fetchResults()
  }, [assessmentId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading results...</p>
        </div>
      </div>
    )
  }

  if (!result || !result.overall_score) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Results not found</p>
        </div>
      </div>
    )
  }

  const scoreInfo = getScoreLabel(result.overall_score)

  const radarData = Object.entries(result.section_scores || {}).map(([key, value]) => ({
    subject: SECTION_NAMES[key] || key,
    score: value.percentage,
    fullMark: 100
  }))

  const barData = Object.entries(result.section_scores || {}).map(([key, value]) => ({
    name: SECTION_NAMES[key] || key,
    percentage: value.percentage,
    color: getScoreColor(value.percentage)
  }))

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-center">
          <Image
            src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
            alt="The Tree Consultancy"
            width={40}
            height={40}
          />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Your Communication Health Score
          </h1>
          <p className="text-gray-500 mb-6">Based on your responses</p>

          <div className="relative inline-flex items-center justify-center">
            <svg className="w-48 h-48 transform -rotate-90">
              <circle cx="96" cy="96" r="88" stroke="#e5e7eb" strokeWidth="12" fill="none" />
              <circle
                cx="96" cy="96" r="88"
                stroke={getScoreColor(result.overall_score)}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 88}
                strokeDashoffset={2 * Math.PI * 88 * (1 - result.overall_score / 100)}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-bold text-gray-900">{result.overall_score}%</span>
              <span className={`text-sm font-medium px-3 py-1 rounded-full mt-2 ${scoreInfo.bg} ${scoreInfo.color}`}>
                {scoreInfo.label}
              </span>
            </div>
          </div>

          <p className="text-gray-600 mt-6 max-w-lg mx-auto">
            {result.overall_score >= 75
              ? 'Great job! Your organisation shows strong communication practices.'
              : result.overall_score >= 50
              ? 'Your communication is developing. There are opportunities for improvement.'
              : 'Communication needs attention. Consider focusing on the areas highlighted below.'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
            Communication Health Overview
          </h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#6b7280', fontSize: 11 }} tickLine={false} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <Radar name="Score" dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.3} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Section Breakdown</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 140 }}>
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#6b7280' }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#374151', fontSize: 12 }} width={130} />
                <Tooltip formatter={(value) => [`${value}%`, 'Score']} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
                  {barData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-8">
          <h3 className="font-medium text-gray-900 mb-4">Score Guide</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 bg-emerald-50 rounded-lg">
              <div className="w-4 h-4 bg-emerald-500 rounded-full mx-auto mb-2"></div>
              <p className="text-sm font-medium text-emerald-700">75-100%</p>
              <p className="text-xs text-emerald-600">Healthy</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-lg">
              <div className="w-4 h-4 bg-amber-500 rounded-full mx-auto mb-2"></div>
              <p className="text-sm font-medium text-amber-700">50-74%</p>
              <p className="text-xs text-amber-600">Developing</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="w-4 h-4 bg-red-500 rounded-full mx-auto mb-2"></div>
              <p className="text-sm font-medium text-red-700">0-49%</p>
              <p className="text-xs text-red-600">Needs Attention</p>
            </div>
          </div>
        </div>

        <div className="text-center text-gray-500 text-sm">
          <p>Thank you for completing the Communication Health Check</p>
          <p className="mt-1">Powered by The Tree Consultancy</p>
        </div>
      </div>
    </main>
  )
}
