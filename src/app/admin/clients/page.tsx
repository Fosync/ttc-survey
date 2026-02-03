'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'

interface Client {
  id: string
  company_name: string
  industry: string
  employee_count: string
  contact_email: string | null
  created_at: string
}

interface Assessment {
  id: string
  client_id: string
  title: string
  access_code: string
  status: 'active' | 'closed' | 'draft'
  created_at: string
  response_count?: number
}

interface ExistingCompany {
  name: string
  responseCount: number
  avgScore: number
  companySize: string | null
}

const INDUSTRIES = [
  'Technology',
  'Finance / Banking',
  'Healthcare',
  'Retail',
  'Manufacturing',
  'Education',
  'Professional Services',
  'Government',
  'Non-Profit',
  'Other'
]

const EMPLOYEE_COUNTS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+'
]

const generateAccessCode = (companyName: string): string => {
  const prefix = companyName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 4) || 'CODE'
  const year = new Date().getFullYear()
  const random = Math.random().toString(36).substring(2, 5).toUpperCase()
  return `${prefix}${year}${random}`.slice(0, 10)
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [existingCompanies, setExistingCompanies] = useState<ExistingCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewClient, setShowNewClient] = useState(false)
  const [showNewAssessment, setShowNewAssessment] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [importingCompany, setImportingCompany] = useState<string | null>(null)
  const router = useRouter()

  // New client form
  const [newClient, setNewClient] = useState({
    company_name: '',
    industry: '',
    employee_count: '',
    contact_email: ''
  })

  // New assessment form
  const [newAssessment, setNewAssessment] = useState({
    client_id: '',
    title: '',
    access_code: ''
  })

  useEffect(() => {
    const isAuth = localStorage.getItem('ttc_admin_auth')
    if (isAuth !== 'true') {
      router.push('/admin')
      return
    }
    fetchData()
  }, [router])

  const fetchData = async () => {
    try {
      // Fetch clients
      const { data: clientsData, error: clientsError } = await supabase
        .from('ttc_clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (clientsError) console.log('ttc_clients table may not exist:', clientsError.message)

      // Fetch assessments with response counts
      const { data: assessmentsData, error: assessmentsError } = await supabase
        .from('ttc_assessments')
        .select('*')
        .order('created_at', { ascending: false })

      if (assessmentsError) console.log('ttc_assessments error:', assessmentsError.message)

      // Fetch existing companies from responses (not yet in ttc_clients)
      const { data: responsesData } = await supabase
        .from('ttc_responses')
        .select('respondent_company, company_size, overall_score')
        .not('completed_at', 'is', null)
        .not('respondent_company', 'is', null)

      if (clientsData) setClients(clientsData)

    if (assessmentsData) {
      // Get response counts for each assessment
      const assessmentsWithCounts = await Promise.all(
        assessmentsData.map(async (assessment) => {
          const { count } = await supabase
            .from('ttc_responses')
            .select('*', { count: 'exact', head: true })
            .eq('assessment_id', assessment.id)
            .not('completed_at', 'is', null)
          return { ...assessment, response_count: count || 0 }
        })
      )
      setAssessments(assessmentsWithCounts)
    }

    // Process existing companies from responses
      if (responsesData) {
        const clientNames = new Set((clientsData || []).map(c => c.company_name.toLowerCase()))
        const companyMap: Record<string, { scores: number[], sizes: string[] }> = {}

        responsesData.forEach(r => {
          if (r.respondent_company && !clientNames.has(r.respondent_company.toLowerCase())) {
            if (!companyMap[r.respondent_company]) {
              companyMap[r.respondent_company] = { scores: [], sizes: [] }
            }
            if (r.overall_score) companyMap[r.respondent_company].scores.push(r.overall_score)
            if (r.company_size) companyMap[r.respondent_company].sizes.push(r.company_size)
          }
        })

        const companies: ExistingCompany[] = Object.entries(companyMap).map(([name, data]) => ({
          name,
          responseCount: data.scores.length,
          avgScore: data.scores.length > 0
            ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length
            : 0,
          companySize: data.sizes[0] || null
        })).sort((a, b) => b.responseCount - a.responseCount)

        setExistingCompanies(companies)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const importCompany = async (company: ExistingCompany) => {
    setImportingCompany(company.name)

    const { data, error } = await supabase
      .from('ttc_clients')
      .insert({
        company_name: company.name,
        industry: 'Other',
        employee_count: company.companySize || '51-200',
        contact_email: null
      })
      .select()
      .single()

    if (error) {
      alert('Error importing company: ' + error.message)
      setImportingCompany(null)
      return
    }

    // Add to clients and remove from existing companies
    setClients([data, ...clients])
    setExistingCompanies(existingCompanies.filter(c => c.name !== company.name))

    // Offer to create assessment
    setSelectedClient(data)
    setNewAssessment({
      client_id: data.id,
      title: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()} Communication Check`,
      access_code: generateAccessCode(data.company_name)
    })
    setShowNewAssessment(true)
    setImportingCompany(null)
  }

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault()

    const { data, error } = await supabase
      .from('ttc_clients')
      .insert({
        company_name: newClient.company_name,
        industry: newClient.industry,
        employee_count: newClient.employee_count,
        contact_email: newClient.contact_email || null
      })
      .select()
      .single()

    if (error) {
      alert('Error creating client: ' + error.message)
      return
    }

    setClients([data, ...clients])
    setNewClient({ company_name: '', industry: '', employee_count: '', contact_email: '' })
    setShowNewClient(false)

    // Open assessment creation for new client
    setSelectedClient(data)
    setNewAssessment({
      client_id: data.id,
      title: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()} Communication Check`,
      access_code: generateAccessCode(data.company_name)
    })
    setShowNewAssessment(true)
  }

  const createAssessment = async (e: React.FormEvent) => {
    e.preventDefault()

    const { data, error } = await supabase
      .from('ttc_assessments')
      .insert({
        client_id: newAssessment.client_id,
        title: newAssessment.title,
        access_code: newAssessment.access_code.toUpperCase(),
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        alert('This access code already exists. Please use a different one.')
      } else {
        alert('Error creating assessment: ' + error.message)
      }
      return
    }

    setAssessments([{ ...data, response_count: 0 }, ...assessments])
    setNewAssessment({ client_id: '', title: '', access_code: '' })
    setShowNewAssessment(false)
    setSelectedClient(null)
  }

  const copyToClipboard = (code: string) => {
    const url = `https://survey.thetreeconsultancy.com`
    const text = `Survey Link: ${url}\nAccess Code: ${code}`
    navigator.clipboard.writeText(text)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const toggleAssessmentStatus = async (assessment: Assessment) => {
    const newStatus = assessment.status === 'active' ? 'closed' : 'active'
    const { error } = await supabase
      .from('ttc_assessments')
      .update({ status: newStatus })
      .eq('id', assessment.id)

    if (!error) {
      setAssessments(assessments.map(a =>
        a.id === assessment.id ? { ...a, status: newStatus } : a
      ))
    }
  }

  const getClientName = (clientId: string) => {
    return clients.find(c => c.id === clientId)?.company_name || 'Unknown'
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
              alt="TTC"
              width={50}
              height={50}
            />
            <div>
              <h1 className="font-bold text-lg text-gray-900">Client Management</h1>
              <p className="text-sm text-gray-500">Manage clients and assessments</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/dashboard" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
              Responses
            </Link>
            <Link href="/admin/analytics" className="text-blue-600 hover:text-blue-800 text-sm font-medium">
              Analytics
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-1">Total Clients</p>
            <p className="text-3xl font-bold text-gray-900">{clients.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-1">Active Assessments</p>
            <p className="text-3xl font-bold text-emerald-600">
              {assessments.filter(a => a.status === 'active').length}
            </p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <p className="text-sm text-gray-500 mb-1">Total Responses</p>
            <p className="text-3xl font-bold text-blue-600">
              {assessments.reduce((sum, a) => sum + (a.response_count || 0), 0) + existingCompanies.reduce((sum, c) => sum + c.responseCount, 0)}
            </p>
          </div>
        </div>

        {/* Existing Companies (from responses, not yet in clients) */}
        {existingCompanies.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="font-semibold text-amber-800">Existing Companies from Surveys</h2>
                <p className="text-sm text-amber-600">These companies have survey responses but are not registered as clients yet</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {existingCompanies.map(company => (
                <div key={company.name} className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-gray-900">{company.name}</h3>
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
                      {company.responseCount} responses
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3">
                    Avg Score: <span className="font-medium">{company.avgScore.toFixed(1)}%</span>
                    {company.companySize && ` • ${company.companySize} employees`}
                  </p>
                  <button
                    onClick={() => importCompany(company)}
                    disabled={importingCompany === company.name}
                    className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-gray-400 text-white px-3 py-2 rounded-lg text-sm font-medium"
                  >
                    {importingCompany === company.name ? 'Importing...' : 'Import as Client'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Clients */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="font-semibold text-gray-900">Clients</h2>
              <button
                onClick={() => setShowNewClient(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                + Add Client
              </button>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {clients.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No clients yet. Add your first client!
                </div>
              ) : (
                clients.map(client => (
                  <div key={client.id} className="p-4 hover:bg-slate-50">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-medium text-gray-900">{client.company_name}</h3>
                        <p className="text-sm text-gray-500">{client.industry} • {client.employee_count} employees</p>
                        {client.contact_email && (
                          <p className="text-xs text-gray-400 mt-1">{client.contact_email}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedClient(client)
                          setNewAssessment({
                            client_id: client.id,
                            title: `Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()} Communication Check`,
                            access_code: generateAccessCode(client.company_name)
                          })
                          setShowNewAssessment(true)
                        }}
                        className="text-emerald-600 hover:text-emerald-800 text-sm font-medium"
                      >
                        + Assessment
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Assessments */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 border-b">
              <h2 className="font-semibold text-gray-900">Assessments & Access Codes</h2>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {assessments.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No assessments yet. Create one for a client!
                </div>
              ) : (
                assessments.map(assessment => (
                  <div key={assessment.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-medium text-gray-900">{assessment.title}</h3>
                        <p className="text-sm text-gray-500">{getClientName(assessment.client_id)}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        assessment.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {assessment.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-3 p-3 bg-slate-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 mb-1">Access Code</p>
                        <p className="font-mono font-bold text-lg text-gray-900">{assessment.access_code}</p>
                      </div>
                      <button
                        onClick={() => copyToClipboard(assessment.access_code)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          copiedCode === assessment.access_code
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-white border hover:bg-slate-100'
                        }`}
                      >
                        {copiedCode === assessment.access_code ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="flex justify-between items-center mt-3 text-sm">
                      <span className="text-gray-500">
                        {assessment.response_count || 0} responses
                      </span>
                      <button
                        onClick={() => toggleAssessmentStatus(assessment)}
                        className={`text-sm ${
                          assessment.status === 'active'
                            ? 'text-red-600 hover:text-red-800'
                            : 'text-emerald-600 hover:text-emerald-800'
                        }`}
                      >
                        {assessment.status === 'active' ? 'Close' : 'Reopen'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Client Modal */}
      {showNewClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Add New Client</h2>
            <form onSubmit={createClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                <input
                  type="text"
                  value={newClient.company_name}
                  onChange={(e) => setNewClient({ ...newClient, company_name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Industry *</label>
                <select
                  value={newClient.industry}
                  onChange={(e) => setNewClient({ ...newClient, industry: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                >
                  <option value="">Select industry...</option>
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee Count *</label>
                <select
                  value={newClient.employee_count}
                  onChange={(e) => setNewClient({ ...newClient, employee_count: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 bg-white"
                  required
                >
                  <option value="">Select size...</option>
                  {EMPLOYEE_COUNTS.map(size => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={newClient.contact_email}
                  onChange={(e) => setNewClient({ ...newClient, contact_email: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  placeholder="optional"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewClient(false)}
                  className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
                >
                  Create Client
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Assessment Modal */}
      {showNewAssessment && selectedClient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Create Assessment</h2>
            <p className="text-gray-500 mb-4">for {selectedClient.company_name}</p>
            <form onSubmit={createAssessment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assessment Title *</label>
                <input
                  type="text"
                  value={newAssessment.title}
                  onChange={(e) => setNewAssessment({ ...newAssessment, title: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Code *</label>
                <input
                  type="text"
                  value={newAssessment.access_code}
                  onChange={(e) => setNewAssessment({ ...newAssessment, access_code: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono uppercase"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-generated. You can customize it.
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Survey Link:</strong><br />
                  survey.thetreeconsultancy.com<br />
                  <strong>Code:</strong> {newAssessment.access_code || '...'}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowNewAssessment(false); setSelectedClient(null) }}
                  className="flex-1 px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
                >
                  Create Assessment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
