'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'

interface Response {
  id: string
  respondent_name: string | null
  respondent_email: string | null
  respondent_company: string | null
  respondent_department: string | null
  respondent_role: string | null
  overall_score: number | null
  completed_at: string | null
  created_at: string
}

const getScoreColor = (score: number | null) => {
  if (!score) return 'bg-gray-100 text-gray-600'
  if (score >= 87.5) return 'bg-emerald-100 text-emerald-700' // 3.5/4 = 87.5%
  if (score >= 70) return 'bg-yellow-100 text-yellow-700'     // 2.8/4 = 70%
  if (score >= 50) return 'bg-orange-100 text-orange-700'     // 2.0/4 = 50%
  return 'bg-red-100 text-red-700'
}

const getScoreLabel = (score: number | null) => {
  if (!score) return 'Incomplete'
  if (score >= 87.5) return 'Strong'
  if (score >= 70) return 'Functional'
  if (score >= 50) return 'Gaps'
  return 'Friction'
}

export default function AdminDashboard() {
  const [responses, setResponses] = useState<Response[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, completed: 0, avgScore: 0 })
  const router = useRouter()

  useEffect(() => {
    const isAuth = localStorage.getItem('ttc_admin_auth')
    if (isAuth !== 'true') {
      router.push('/admin')
      return
    }

    fetchResponses()
  }, [router])

  const fetchResponses = async () => {
    const { data, error } = await supabase
      .from('ttc_responses')
      .select('*')
      .order('created_at', { ascending: false })

    if (data) {
      setResponses(data)
      const completed = data.filter(r => r.completed_at)
      const avgScore = completed.length > 0 
        ? Math.round(completed.reduce((acc, r) => acc + (r.overall_score || 0), 0) / completed.length)
        : 0
      setStats({
        total: data.length,
        completed: completed.length,
        avgScore
      })
    }
    setLoading(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('ttc_admin_auth')
    router.push('/admin')
  }

  const exportCSV = () => {
    const headers = ['Date', 'Name', 'Email', 'Company', 'Department', 'Role', 'Score', 'Status']
    const rows = responses.map(r => [
      new Date(r.created_at).toLocaleDateString(),
      r.respondent_name || '-',
      r.respondent_email || '-',
      r.respondent_company || '-',
      r.respondent_department || '-',
      r.respondent_role || '-',
      r.overall_score ? `${r.overall_score}%` : '-',
      r.completed_at ? 'Completed' : 'Incomplete'
    ])
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ttc-responses-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
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
            <Image
              src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
              alt="The Tree Consultancy"
              width={40}
              height={40}
            />
            <div>
              <h1 className="font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-500">Communication Health Check</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-1">Total Responses</p>
            <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-1">Completed</p>
            <p className="text-3xl font-bold text-emerald-600">{stats.completed}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-1">Average Score</p>
            <p className="text-3xl font-bold text-slate-700">{stats.avgScore}%</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">All Responses</h2>
          <button
            onClick={exportCSV}
            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Date</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Respondent</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Company</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Department</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Score</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left px-6 py-4 text-sm font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {responses.map((response) => (
                <tr key={response.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(response.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {response.respondent_name || 'Anonymous'}
                      </p>
                      <p className="text-xs text-gray-500">{response.respondent_email || '-'}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {response.respondent_company || '-'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {response.respondent_department || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getScoreColor(response.overall_score)}`}>
                      {response.overall_score ? `${response.overall_score}%` : '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      response.completed_at 
                        ? 'bg-emerald-100 text-emerald-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {response.completed_at ? 'Completed' : 'In Progress'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {response.completed_at && (
                      <Link
                        href={`/admin/response/${response.id}`}
                        className="text-slate-600 hover:text-slate-900 text-sm font-medium"
                      >
                        View →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {responses.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No responses yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
