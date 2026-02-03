'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'

interface ResponseData {
  id: string
  respondent_department: string | null
  respondent_role: string | null
  respondent_company: string | null
  section_scores: Record<string, number | { score: number; max: number; percentage: number }>
  overall_score: number
  completed_at: string | null
}

const SECTIONS = [
  { key: 'work_changes', name: 'Work Changes', short: 'Work Chg' },
  { key: 'finding_info', name: 'Finding Info', short: 'Find Info' },
  { key: 'speaking_up', name: 'Speaking Up', short: 'Speak Up' },
  { key: 'cross_team', name: 'Cross Team', short: 'Cross Tm' },
  { key: 'leadership', name: 'Leadership', short: 'Leader' },
  { key: 'during_change', name: 'During Change', short: 'Dur Chg' },
  { key: 'culture', name: 'Culture', short: 'Culture' },
  { key: 'overload', name: 'Overload', short: 'Overload' }
]

// Convert 1-4 scale to percentage (1=25%, 4=100%)
const toPercentage = (score: number | { percentage: number } | undefined): number | null => {
  if (score === undefined || score === null) return null
  if (typeof score === 'object' && 'percentage' in score) return score.percentage
  // Convert 1-4 scale to 25-100%
  return Math.round((score / 4) * 100)
}

// Heat color based on percentage (converted from 1-4 scale)
// 3.5+ = 87.5%+ (Strong), 2.8-3.4 = 70-87% (Functional), 2.0-2.7 = 50-70% (Gaps), <2.0 = <50% (Friction)
const getHeatColor = (score: number | null) => {
  if (score === null || score === undefined) return 'bg-gray-100'
  if (score >= 87.5) return 'bg-emerald-500'  // Strong (3.5+)
  if (score >= 70) return 'bg-yellow-400'      // Functional (2.8-3.4)
  if (score >= 50) return 'bg-orange-500'      // Gaps (2.0-2.7)
  return 'bg-red-500'                          // Friction (<2.0)
}

const getTextColor = (score: number | null) => {
  if (score === null || score === undefined) return 'text-gray-400'
  return 'text-white'
}

export default function AnalyticsPage() {
  const [responses, setResponses] = useState<ResponseData[]>([])
  const [loading, setLoading] = useState(true)
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const router = useRouter()

  // Aggregated data
  const [deptSectionData, setDeptSectionData] = useState<Record<string, Record<string, number>>>({})
  const [roleSectionData, setRoleSectionData] = useState<Record<string, Record<string, number>>>({})
  const [deptRoleData, setDeptRoleData] = useState<Record<string, Record<string, number>>>({})
  const [problemAreas, setProblemAreas] = useState<{section: string, score: number}[]>([])
  const [deptGaps, setDeptGaps] = useState<{section: string, highDept: string, lowDept: string, gap: number}[]>([])
  const [speakingUpAlerts, setSpeakingUpAlerts] = useState<{dept: string, score: number}[]>([])
  const [perceptionGap, setPerceptionGap] = useState<{section: string, execScore: number, staffScore: number, gap: number}[]>([])

  // AI Report
  const [aiReport, setAiReport] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiLanguage, setAiLanguage] = useState<'en' | 'tr'>('en')

  const companies = [...new Set(responses.map(r => r.respondent_company).filter(Boolean))] as string[]
  const filteredResponses = companyFilter 
    ? responses.filter(r => r.respondent_company === companyFilter)
    : responses

  const departments = [...new Set(filteredResponses.map(r => r.respondent_department).filter(Boolean))] as string[]
  const roles = [...new Set(filteredResponses.map(r => r.respondent_role).filter(Boolean))] as string[]

  useEffect(() => {
    const isAuth = localStorage.getItem('ttc_admin_auth')
    if (isAuth !== 'true') {
      router.push('/admin')
      return
    }
    fetchData()
  }, [router])

  useEffect(() => {
    if (filteredResponses.length > 0) {
      calculateAggregates()
    }
  }, [filteredResponses, companyFilter])

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('ttc_responses')
      .select('*')
      .not('completed_at', 'is', null)
      .order('created_at', { ascending: false })

    if (data) {
      setResponses(data)
    }
    setLoading(false)
  }

  const getSectionScore = (r: ResponseData, sectionKey: string): number | null => {
    const score = r.section_scores?.[sectionKey]
    return toPercentage(score)
  }

  const calculateAggregates = () => {
    const deptSection: Record<string, Record<string, number[]>> = {}
    const roleSection: Record<string, Record<string, number[]>> = {}
    const deptRole: Record<string, Record<string, number[]>> = {}

    filteredResponses.forEach(r => {
      const dept = r.respondent_department || 'Unknown'
      const role = r.respondent_role || 'Unknown'

      if (!deptSection[dept]) deptSection[dept] = {}
      if (!roleSection[role]) roleSection[role] = {}
      if (!deptRole[dept]) deptRole[dept] = {}

      SECTIONS.forEach(s => {
        const score = getSectionScore(r, s.key)
        if (score !== null) {
          if (!deptSection[dept][s.key]) deptSection[dept][s.key] = []
          deptSection[dept][s.key].push(score)

          if (!roleSection[role][s.key]) roleSection[role][s.key] = []
          roleSection[role][s.key].push(score)
        }
      })

      const overallPct = toPercentage(r.overall_score)
      if (overallPct !== null) {
        if (!deptRole[dept][role]) deptRole[dept][role] = []
        deptRole[dept][role].push(overallPct)
      }
    })

    // Calculate averages
    const avgDeptSection: Record<string, Record<string, number>> = {}
    const avgRoleSection: Record<string, Record<string, number>> = {}
    const avgDeptRole: Record<string, Record<string, number>> = {}

    Object.entries(deptSection).forEach(([dept, sections]) => {
      avgDeptSection[dept] = {}
      Object.entries(sections).forEach(([section, scores]) => {
        avgDeptSection[dept][section] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      })
    })

    Object.entries(roleSection).forEach(([role, sections]) => {
      avgRoleSection[role] = {}
      Object.entries(sections).forEach(([section, scores]) => {
        avgRoleSection[role][section] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      })
    })

    Object.entries(deptRole).forEach(([dept, roles]) => {
      avgDeptRole[dept] = {}
      Object.entries(roles).forEach(([role, scores]) => {
        avgDeptRole[dept][role] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      })
    })

    setDeptSectionData(avgDeptSection)
    setRoleSectionData(avgRoleSection)
    setDeptRoleData(avgDeptRole)

    // Problem areas
    const sectionAvgs: {section: string, score: number}[] = []
    SECTIONS.forEach(s => {
      const allScores = filteredResponses
        .map(r => getSectionScore(r, s.key))
        .filter(x => x !== null) as number[]
      if (allScores.length > 0) {
        sectionAvgs.push({
          section: s.name,
          score: Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
        })
      }
    })
    setProblemAreas(sectionAvgs.sort((a, b) => a.score - b.score).slice(0, 3))

    // Department gaps
    const gaps: {section: string, highDept: string, lowDept: string, gap: number}[] = []
    SECTIONS.forEach(s => {
      const deptScores = Object.entries(avgDeptSection)
        .map(([dept, scores]) => ({ dept, score: scores[s.key] }))
        .filter(x => x.score !== undefined)
        .sort((a, b) => b.score - a.score)
      
      if (deptScores.length >= 2) {
        const gap = deptScores[0].score - deptScores[deptScores.length - 1].score
        if (gap > 10) {
          gaps.push({
            section: s.name,
            highDept: deptScores[0].dept,
            lowDept: deptScores[deptScores.length - 1].dept,
            gap
          })
        }
      }
    })
    setDeptGaps(gaps.sort((a, b) => b.gap - a.gap).slice(0, 5))

    // Speaking Up alerts
    const speakingAlerts = Object.entries(avgDeptSection)
      .map(([dept, scores]) => ({ dept, score: scores['speaking_up'] }))
      .filter(x => x.score !== undefined && x.score < 65)
      .sort((a, b) => a.score - b.score)
    setSpeakingUpAlerts(speakingAlerts)

    // Leadership vs Staff perception gap
    const execRoles = ['Executive / C-Level', 'Director / VP']
    const staffRoles = ['Individual Contributor / Staff', 'Intern / Entry Level']
    
    const perceptionGaps: {section: string, execScore: number, staffScore: number, gap: number}[] = []
    SECTIONS.forEach(s => {
      const execScores = filteredResponses
        .filter(r => execRoles.includes(r.respondent_role || ''))
        .map(r => getSectionScore(r, s.key))
        .filter(x => x !== null) as number[]
      
      const staffScores = filteredResponses
        .filter(r => staffRoles.includes(r.respondent_role || ''))
        .map(r => getSectionScore(r, s.key))
        .filter(x => x !== null) as number[]

      if (execScores.length > 0 && staffScores.length > 0) {
        const execAvg = Math.round(execScores.reduce((a, b) => a + b, 0) / execScores.length)
        const staffAvg = Math.round(staffScores.reduce((a, b) => a + b, 0) / staffScores.length)
        const gap = execAvg - staffAvg
        if (Math.abs(gap) > 10) {
          perceptionGaps.push({ section: s.name, execScore: execAvg, staffScore: staffAvg, gap })
        }
      }
    })
    setPerceptionGap(perceptionGaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)))
  }

  const avgOverall = filteredResponses.length > 0
    ? Math.round(filteredResponses.reduce((a, r) => a + (toPercentage(r.overall_score) || 0), 0) / filteredResponses.length)
    : 0

  const generateCompanyReport = async () => {
    setAiLoading(true)
    setAiReport(null)

    try {
      // Calculate section averages (convert to 1-4 scale)
      const sectionScores: Record<string, number> = {}
      SECTIONS.forEach(s => {
        const allScores = filteredResponses
          .map(r => getSectionScore(r, s.key))
          .filter(x => x !== null) as number[]
        if (allScores.length > 0) {
          const avgPct = allScores.reduce((a, b) => a + b, 0) / allScores.length
          sectionScores[s.key] = (avgPct / 100) * 4 // Convert back to 1-4 scale
        }
      })

      // Department breakdown
      const departmentBreakdown: Record<string, { count: number; avgScore: number }> = {}
      const deptCounts: Record<string, { count: number; total: number }> = {}
      filteredResponses.forEach(r => {
        const dept = r.respondent_department || 'Unknown'
        if (!deptCounts[dept]) deptCounts[dept] = { count: 0, total: 0 }
        deptCounts[dept].count++
        deptCounts[dept].total += (toPercentage(r.overall_score) || 0) / 100 * 4
      })
      Object.entries(deptCounts).forEach(([dept, data]) => {
        departmentBreakdown[dept] = {
          count: data.count,
          avgScore: data.total / data.count
        }
      })

      // Role breakdown
      const roleBreakdown: Record<string, { count: number; avgScore: number }> = {}
      const roleCounts: Record<string, { count: number; total: number }> = {}
      filteredResponses.forEach(r => {
        const role = r.respondent_role || 'Unknown'
        if (!roleCounts[role]) roleCounts[role] = { count: 0, total: 0 }
        roleCounts[role].count++
        roleCounts[role].total += (toPercentage(r.overall_score) || 0) / 100 * 4
      })
      Object.entries(roleCounts).forEach(([role, data]) => {
        roleBreakdown[role] = {
          count: data.count,
          avgScore: data.total / data.count
        }
      })

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'company',
          language: aiLanguage,
          data: {
            overallScore: (avgOverall / 100) * 4, // Convert to 1-4 scale
            companyName: companyFilter || 'All Companies',
            totalResponses: filteredResponses.length,
            sectionScores,
            departmentBreakdown,
            roleBreakdown,
            perceptionGaps: perceptionGap.map(g => ({
              from: 'Leadership',
              to: 'Staff',
              gap: (g.gap / 100) * 4
            }))
          }
        })
      })

      const result = await response.json()
      if (result.error) {
        setAiReport(`Error: ${result.error}`)
      } else {
        setAiReport(result.analysis)
      }
    } catch (error) {
      setAiReport(`Error: ${error instanceof Error ? error.message : 'Failed to generate report'}`)
    }

    setAiLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg" alt="TTC" width={50} height={50} />
            <div>
              <h1 className="font-bold text-lg text-gray-900">Analytics Dashboard</h1>
              <p className="text-sm text-gray-500">Communication Health Insights</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Link href="/admin/orgchart" className="text-emerald-600 hover:text-emerald-800 text-sm font-medium">🏢 Org Chart</Link>
            <Link href="/admin/dashboard" className="text-slate-600 hover:text-slate-900 text-sm font-medium">← Responses</Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {responses.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500">No completed responses yet.</p>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Responses</p>
                <p className="text-3xl font-bold text-gray-900">{filteredResponses.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Companies</p>
                <p className="text-3xl font-bold text-blue-600">{companyFilter ? 1 : companies.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Departments</p>
                <p className="text-3xl font-bold text-purple-600">{departments.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Roles</p>
                <p className="text-3xl font-bold text-indigo-600">{roles.length}</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-6">
                <p className="text-sm text-gray-500">Avg Score</p>
                <p className={`text-3xl font-bold ${avgOverall >= 75 ? 'text-emerald-600' : avgOverall >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{avgOverall}%</p>
              </div>
            </div>

            {/* AI Company Report */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl shadow-sm p-6 mb-8 border border-blue-100">
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <span className="text-xl">🤖</span> AI Company Report
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
                  <Link
                    href="/admin/settings"
                    className="text-gray-500 hover:text-gray-700 text-sm"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={generateCompanyReport}
                    disabled={aiLoading || filteredResponses.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
                  >
                    {aiLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        Generating...
                      </>
                    ) : (
                      <>Generate Company Report</>
                    )}
                  </button>
                </div>
              </div>

              {aiReport ? (
                <div className="bg-white rounded-lg p-4 prose prose-sm max-w-none">
                  <div className="whitespace-pre-wrap text-gray-700">{aiReport}</div>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">
                  Click "Generate Company Report" to get AI-powered insights about {companyFilter || 'all companies'}.
                </p>
              )}
            </div>

            {/* Alerts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Problem Areas */}
              {problemAreas.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                  <h3 className="font-semibold text-red-800 mb-3">⚠️ Lowest Scoring Areas</h3>
                  <div className="space-y-2">
                    {problemAreas.map((area, i) => (
                      <div key={i} className="flex justify-between items-center bg-white rounded-lg p-3">
                        <span className="font-medium text-gray-900">{area.section}</span>
                        <span className={`font-bold ${area.score < 50 ? 'text-red-600' : 'text-orange-600'}`}>{area.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Speaking Up Alerts */}
              {speakingUpAlerts.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                  <h3 className="font-semibold text-amber-800 mb-3">🚨 Psychological Safety Concern</h3>
                  <p className="text-sm text-amber-700 mb-3">Low "Speaking Up" scores may indicate hierarchy issues:</p>
                  <div className="flex flex-wrap gap-2">
                    {speakingUpAlerts.map((alert, i) => (
                      <span key={i} className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium">
                        {alert.dept}: {alert.score}%
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Perception Gap */}
            {perceptionGap.length > 0 && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-purple-800 mb-3">👔 Leadership vs Staff Perception Gap</h3>
                <p className="text-sm text-purple-700 mb-4">Areas where executives see things differently than staff:</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {perceptionGap.map((p, i) => (
                    <div key={i} className="bg-white rounded-lg p-4 border border-purple-100">
                      <p className="font-medium text-gray-900 mb-2">{p.section}</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-purple-600">Exec: {p.execScore}%</span>
                        <span className="text-gray-600">Staff: {p.staffScore}%</span>
                        <span className={`font-bold ${p.gap > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {p.gap > 0 ? '+' : ''}{p.gap}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Department Gaps */}
            {deptGaps.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
                <h3 className="font-semibold text-blue-800 mb-3">📊 Biggest Department Gaps</h3>
                <div className="space-y-2">
                  {deptGaps.map((gap, i) => (
                    <div key={i} className="bg-white rounded-lg p-3 flex items-center justify-between">
                      <div>
                        <span className="font-medium text-gray-900">{gap.section}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          <span className="text-emerald-600">{gap.highDept}</span> → <span className="text-red-600">{gap.lowDept}</span>
                        </span>
                      </div>
                      <span className="font-bold text-blue-600">{gap.gap}pt gap</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* HEATMAP 1: Department x Section */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
              <h2 className="font-bold text-lg text-gray-900 mb-2">🗺️ Department × Section Heatmap</h2>
              <p className="text-sm text-gray-500 mb-6">Which departments struggle with which communication areas?</p>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-sm font-medium text-gray-500 min-w-[140px]">Department</th>
                      {SECTIONS.map(s => (
                        <th key={s.key} className="p-2 text-xs font-medium text-gray-500 text-center min-w-[70px]">{s.short}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(deptSectionData).sort((a, b) => a[0].localeCompare(b[0])).map(([dept, scores]) => (
                      <tr key={dept}>
                        <td className="p-2 text-sm font-medium text-gray-900 border-t">{dept}</td>
                        {SECTIONS.map(s => {
                          const score = scores[s.key]
                          return (
                            <td key={s.key} className="p-1 border-t">
                              <div className={`${getHeatColor(score)} ${getTextColor(score)} rounded-lg p-2 text-center text-sm font-bold`}>
                                {score !== undefined ? score : '-'}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-2 mt-6 justify-center">
                <span className="text-xs text-gray-500">Low</span>
                <div className="w-6 h-4 bg-red-500 rounded"></div>
                <div className="w-6 h-4 bg-orange-500 rounded"></div>
                <div className="w-6 h-4 bg-orange-400 rounded"></div>
                <div className="w-6 h-4 bg-yellow-400 rounded"></div>
                <div className="w-6 h-4 bg-emerald-400 rounded"></div>
                <div className="w-6 h-4 bg-emerald-500 rounded"></div>
                <span className="text-xs text-gray-500">High</span>
              </div>
            </div>

            {/* HEATMAP 2: Role x Section */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
              <h2 className="font-bold text-lg text-gray-900 mb-2">👔 Role × Section Heatmap</h2>
              <p className="text-sm text-gray-500 mb-6">How do different seniority levels perceive communication?</p>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-sm font-medium text-gray-500 min-w-[180px]">Role</th>
                      {SECTIONS.map(s => (
                        <th key={s.key} className="p-2 text-xs font-medium text-gray-500 text-center min-w-[70px]">{s.short}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(roleSectionData).map(([role, scores]) => (
                      <tr key={role}>
                        <td className="p-2 text-sm font-medium text-gray-900 border-t">{role}</td>
                        {SECTIONS.map(s => {
                          const score = scores[s.key]
                          return (
                            <td key={s.key} className="p-1 border-t">
                              <div className={`${getHeatColor(score)} ${getTextColor(score)} rounded-lg p-2 text-center text-sm font-bold`}>
                                {score !== undefined ? score : '-'}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* HEATMAP 3: Department x Role */}
            <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
              <h2 className="font-bold text-lg text-gray-900 mb-2">🏢 Department × Role Heatmap</h2>
              <p className="text-sm text-gray-500 mb-6">Overall satisfaction by department and seniority</p>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th className="text-left p-2 text-sm font-medium text-gray-500 min-w-[140px]">Department</th>
                      {roles.map(role => (
                        <th key={role} className="p-2 text-xs font-medium text-gray-500 text-center min-w-[90px]">{role.split(' / ')[0]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(deptRoleData).sort((a, b) => a[0].localeCompare(b[0])).map(([dept, roleScores]) => (
                      <tr key={dept}>
                        <td className="p-2 text-sm font-medium text-gray-900 border-t">{dept}</td>
                        {roles.map(role => {
                          const score = roleScores[role]
                          return (
                            <td key={role} className="p-1 border-t">
                              <div className={`${getHeatColor(score)} ${getTextColor(score)} rounded-lg p-2 text-center text-sm font-bold`}>
                                {score !== undefined ? score : '-'}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Score Legend */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-medium text-gray-900 mb-4">Score Guide</h3>
              <div className="grid grid-cols-6 gap-2 text-center text-sm">
                <div><div className="bg-emerald-500 text-white rounded p-2 font-bold">85+</div><p className="text-xs mt-1">Excellent</p></div>
                <div><div className="bg-emerald-400 text-white rounded p-2 font-bold">75-84</div><p className="text-xs mt-1">Good</p></div>
                <div><div className="bg-yellow-400 text-white rounded p-2 font-bold">65-74</div><p className="text-xs mt-1">Fair</p></div>
                <div><div className="bg-orange-400 text-white rounded p-2 font-bold">55-64</div><p className="text-xs mt-1">Needs Work</p></div>
                <div><div className="bg-orange-500 text-white rounded p-2 font-bold">45-54</div><p className="text-xs mt-1">Poor</p></div>
                <div><div className="bg-red-500 text-white rounded p-2 font-bold">&lt;45</div><p className="text-xs mt-1">Critical</p></div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
