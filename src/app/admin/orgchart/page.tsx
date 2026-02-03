'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'

interface ResponseData {
  respondent_department: string | null
  respondent_role: string | null
  respondent_company: string | null
  section_scores: Record<string, number>
  overall_score: number
}

interface OrgNode {
  department: string
  role: string
  score: number
  count: number
  sectionScores: Record<string, number>
}

const SECTION_INFO: Record<string, string> = {
  work_changes: 'Work Changes',
  finding_info: 'Finding Info',
  speaking_up: 'Speaking Up',
  cross_team: 'Cross Team',
  leadership: 'Leadership',
  during_change: 'During Change',
  culture: 'Culture',
  overload: 'Overload'
}

const getScoreColor = (score: number | null) => {
  if (score === null) return { bg: '#f3f4f6', text: '#6b7280', label: 'N/A' }
  if (score >= 3.5) return { bg: '#10b981', text: '#ffffff', label: 'Strong' }
  if (score >= 2.8) return { bg: '#f59e0b', text: '#ffffff', label: 'Functional' }
  if (score >= 2.0) return { bg: '#f97316', text: '#ffffff', label: 'Gaps' }
  return { bg: '#ef4444', text: '#ffffff', label: 'Friction' }
}

const getGapColor = (gap: number) => {
  if (Math.abs(gap) < 0.5) return '#10b981'
  if (Math.abs(gap) < 1.0) return '#f59e0b'
  return '#ef4444'
}

export default function OrgChartPage() {
  const [responses, setResponses] = useState<ResponseData[]>([])
  const [loading, setLoading] = useState(true)
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [hoveredNode, setHoveredNode] = useState<OrgNode | null>(null)
  const router = useRouter()

  const companies = [...new Set(responses.map(r => r.respondent_company).filter(Boolean))] as string[]
  const filteredResponses = companyFilter ? responses.filter(r => r.respondent_company === companyFilter) : responses

  useEffect(() => {
    const isAuth = localStorage.getItem('ttc_admin_auth')
    if (isAuth !== 'true') { router.push('/admin'); return }
    fetchData()
  }, [router])

  const fetchData = async () => {
    const { data } = await supabase.from('ttc_responses').select('*').not('completed_at', 'is', null)
    if (data) setResponses(data)
    setLoading(false)
  }

  const buildOrgData = () => {
    const orgMap: Record<string, Record<string, { scores: number[], sectionScores: Record<string, number[]> }>> = {}
    
    filteredResponses.forEach(r => {
      const dept = r.respondent_department || 'Unknown'
      const role = r.respondent_role || 'Unknown'
      
      if (!orgMap[dept]) orgMap[dept] = {}
      if (!orgMap[dept][role]) orgMap[dept][role] = { scores: [], sectionScores: {} }
      
      orgMap[dept][role].scores.push(r.overall_score)
      
      Object.entries(r.section_scores).forEach(([key, val]) => {
        if (!orgMap[dept][role].sectionScores[key]) orgMap[dept][role].sectionScores[key] = []
        orgMap[dept][role].sectionScores[key].push(typeof val === 'number' ? val : 0)
      })
    })

    const nodes: OrgNode[] = []
    Object.entries(orgMap).forEach(([dept, roles]) => {
      Object.entries(roles).forEach(([role, data]) => {
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length
        const avgSections: Record<string, number> = {}
        Object.entries(data.sectionScores).forEach(([key, scores]) => {
          avgSections[key] = scores.reduce((a, b) => a + b, 0) / scores.length
        })
        nodes.push({ department: dept, role, score: avgScore, count: data.scores.length, sectionScores: avgSections })
      })
    })
    return nodes
  }

  const orgNodes = buildOrgData()
  const departments = [...new Set(orgNodes.map(n => n.department))].filter(d => d !== 'Unknown')
  
  const executives = orgNodes.filter(n => n.role === 'Executive / C-Level')
  const directors = orgNodes.filter(n => n.role === 'Director / VP')
  const managers = orgNodes.filter(n => n.role === 'Manager / Team Lead')
  const staff = orgNodes.filter(n => n.role === 'Individual Contributor / Staff' || n.role === 'Intern / Entry Level')

  const calculateGaps = () => {
    const gaps: { from: string, to: string, fromScore: number, toScore: number, gap: number }[] = []
    
    departments.forEach(dept => {
      const deptNodes = orgNodes.filter(n => n.department === dept)
      const mgr = deptNodes.find(n => n.role === 'Manager / Team Lead')
      const stf = deptNodes.find(n => n.role === 'Individual Contributor / Staff')
      
      if (mgr && stf) {
        gaps.push({ from: dept + ' Mgr', to: dept + ' Staff', fromScore: mgr.score, toScore: stf.score, gap: mgr.score - stf.score })
      }
    })

    const execAvg = executives.length > 0 ? executives.reduce((a, n) => a + n.score, 0) / executives.length : 0
    const staffAvg = staff.length > 0 ? staff.reduce((a, n) => a + n.score, 0) / staff.length : 0
    if (execAvg && staffAvg) {
      gaps.push({ from: 'Executive', to: 'All Staff', fromScore: execAvg, toScore: staffAvg, gap: execAvg - staffAvg })
    }
    return gaps.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  }

  const gaps = calculateGaps()

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-600"></div></div>

  const OrgBox = ({ node }: { node: OrgNode }) => {
    const colors = getScoreColor(node.score)
    return (
      <div
        className="relative p-3 rounded-lg shadow-md cursor-pointer transition-all hover:scale-105 min-w-[130px]"
        style={{ backgroundColor: colors.bg }}
        onMouseEnter={() => setHoveredNode(node)}
        onMouseLeave={() => setHoveredNode(null)}
      >
        <p className="text-xs font-medium truncate" style={{ color: colors.text }}>{node.department}</p>
        <p className="text-xl font-bold" style={{ color: colors.text }}>{node.score.toFixed(2)}</p>
        <p className="text-xs" style={{ color: colors.text, opacity: 0.8 }}>{node.count} resp.</p>
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
              <h1 className="font-bold text-lg text-gray-900">Organization Communication Map</h1>
              <p className="text-sm text-gray-500">Hierarchical Health View</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="px-3 py-2 border rounded-lg text-sm bg-white">
              <option value="">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <Link href="/admin/analytics" className="text-blue-600 hover:text-blue-800 text-sm font-medium">📊 Analytics</Link>
            <Link href="/admin/dashboard" className="text-slate-600 text-sm font-medium">← Dashboard</Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 bg-white rounded-xl shadow-sm p-6">
            <h2 className="font-bold text-lg text-gray-900 mb-6 text-center">🏢 Organization Hierarchy</h2>
            
            {executives.length > 0 && (
              <>
                <p className="text-center text-xs text-gray-500 mb-2">Executive / C-Level</p>
                <div className="flex justify-center mb-4"><div className="flex flex-wrap gap-3 justify-center">{executives.map((n, i) => <OrgBox key={i} node={n} />)}</div></div>
                <div className="flex justify-center my-2"><div className="w-0.5 h-6 bg-gray-300"></div></div>
              </>
            )}

            {directors.length > 0 && (
              <>
                <p className="text-center text-xs text-gray-500 mb-2">Directors / VP</p>
                <div className="flex justify-center mb-4"><div className="flex flex-wrap gap-3 justify-center">{directors.map((n, i) => <OrgBox key={i} node={n} />)}</div></div>
                <div className="flex justify-center my-2"><div className="w-0.5 h-6 bg-gray-300"></div></div>
              </>
            )}

            {managers.length > 0 && (
              <>
                <p className="text-center text-xs text-gray-500 mb-2">Managers / Team Leads</p>
                <div className="flex justify-center mb-4"><div className="flex flex-wrap gap-3 justify-center">{managers.map((n, i) => <OrgBox key={i} node={n} />)}</div></div>
                <div className="flex justify-center my-2"><div className="w-0.5 h-6 bg-gray-300"></div></div>
              </>
            )}

            {staff.length > 0 && (
              <>
                <p className="text-center text-xs text-gray-500 mb-2">Staff / Contributors</p>
                <div className="flex justify-center"><div className="flex flex-wrap gap-3 justify-center">{staff.map((n, i) => <OrgBox key={i} node={n} />)}</div></div>
              </>
            )}

            <div className="mt-8 pt-6 border-t">
              <div className="flex gap-6 flex-wrap justify-center text-xs">
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-emerald-500"></div><span>Strong 3.5+</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-yellow-500"></div><span>Functional 2.8-3.4</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-orange-500"></div><span>Gaps 2.0-2.7</span></div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-500"></div><span>Friction &lt;2.0</span></div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {hoveredNode && (
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-bold text-gray-900">{hoveredNode.department}</h3>
                <p className="text-sm text-gray-500 mb-2">{hoveredNode.role}</p>
                <p className="text-2xl font-bold mb-3" style={{ color: getScoreColor(hoveredNode.score).bg }}>{hoveredNode.score.toFixed(2)}/4.0</p>
                <p className="text-xs text-gray-500 mb-2">{hoveredNode.count} responses</p>
                <div className="space-y-1">
                  {Object.entries(hoveredNode.sectionScores).map(([key, val]) => (
                    <div key={key} className="flex justify-between text-xs">
                      <span className="text-gray-600">{SECTION_INFO[key]}</span>
                      <span className="font-medium" style={{ color: getScoreColor(val).bg }}>{val.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-semibold text-gray-900 mb-3">📉 Perception Gaps</h3>
              <div className="space-y-3">
                {gaps.slice(0, 5).map((gap, i) => (
                  <div key={i} className="text-sm border-b pb-2">
                    <div className="flex justify-between"><span>{gap.from}</span><span className="font-bold">{gap.fromScore.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>{gap.to}</span><span className="font-bold">{gap.toScore.toFixed(2)}</span></div>
                    <div className="text-right"><span className="text-xs font-bold px-2 py-0.5 rounded text-white" style={{ backgroundColor: getGapColor(gap.gap) }}>{gap.gap > 0 ? '+' : ''}{gap.gap.toFixed(2)}</span></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-100 rounded-xl p-4">
              <h3 className="font-semibold text-gray-900 mb-2">📊 Stats</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span>Responses</span><span className="font-bold">{filteredResponses.length}</span></div>
                <div className="flex justify-between"><span>Departments</span><span className="font-bold">{departments.length}</span></div>
                <div className="flex justify-between"><span>Avg Score</span><span className="font-bold">{filteredResponses.length > 0 ? (filteredResponses.reduce((a, r) => a + r.overall_score, 0) / filteredResponses.length).toFixed(2) : '-'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
