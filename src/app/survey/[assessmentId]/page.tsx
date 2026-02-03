'use client'

import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, Question, Section } from '@/lib/supabase'
import Image from 'next/image'

const DEPARTMENTS = [
  'Executive/Leadership',
  'HR / People Operations',
  'Finance / Accounting',
  'Marketing / Communications',
  'Sales / Business Development',
  'Operations',
  'IT / Technology',
  'Customer Service',
  'Legal',
  'Other'
]

const ROLES = [
  'Executive / C-Level',
  'Director / VP',
  'Manager / Team Lead',
  'Individual Contributor / Staff',
  'Intern / Entry Level',
  'Other'
]

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '500+']

interface RespondentInfo {
  name: string
  email: string
  company: string
  department: string
  role: string
  companySize: string
}

interface ClientInfo {
  company_name: string
  employee_count: string
  industry: string
}

export default function SurveyPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = use(params)
  const router = useRouter()

  const [step, setStep] = useState<'intro' | 'survey'>('intro')
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null)
  const [respondentInfo, setRespondentInfo] = useState<RespondentInfo>({
    name: '', email: '', company: '', department: '', role: '', companySize: ''
  })
  
  const [sections, setSections] = useState<Section[]>([])
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [openResponses, setOpenResponses] = useState<Record<string, string>>({})
  const [currentOpenResponse, setCurrentOpenResponse] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    // Load client info from localStorage (set during access code validation)
    const storedClientInfo = localStorage.getItem('ttc_client_info')
    if (storedClientInfo) {
      try {
        const info = JSON.parse(storedClientInfo) as ClientInfo
        setClientInfo(info)
        // Pre-fill company name and size from client info
        setRespondentInfo(prev => ({
          ...prev,
          company: info.company_name || '',
          companySize: info.employee_count || ''
        }))
      } catch {
        // Invalid JSON, ignore
      }
    }

    async function init() {
      const { data: questions, error } = await supabase
        .from('ttc_questions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (error || !questions) return

      const sectionMap = new Map<string, Section>()
      questions.forEach((q: Question) => {
        if (!sectionMap.has(q.section_key)) {
          sectionMap.set(q.section_key, {
            key: q.section_key,
            name: q.section_name,
            icon: q.section_icon,
            questions: []
          })
        }
        sectionMap.get(q.section_key)!.questions.push(q)
      })
      setSections(Array.from(sectionMap.values()))
      setLoading(false)
    }
    init()
  }, [])

  const startSurvey = () => {
    setStep('survey')
  }

  const currentSection = sections[currentSectionIndex]
  const currentQuestion = currentSection?.questions[currentQuestionIndex]
  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0)
  const answeredQuestions = Object.keys(answers).length + Object.keys(openResponses).length

  const handleScaleAnswer = (value: number) => {
    if (!currentQuestion) return
    const newAnswers = { ...answers, [currentQuestion.id]: value }
    setAnswers(newAnswers)
    moveToNextQuestion(newAnswers, openResponses)
  }

  const handleOpenAnswer = () => {
    if (!currentQuestion) return
    const newOpenResponses = { ...openResponses, [currentQuestion.id]: currentOpenResponse }
    setOpenResponses(newOpenResponses)
    setCurrentOpenResponse('')
    moveToNextQuestion(answers, newOpenResponses)
  }

  const moveToNextQuestion = (currentAnswers: Record<string, number>, currentOpenResponses: Record<string, string>) => {
    if (currentQuestionIndex < currentSection.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
      const nextQ = currentSection.questions[currentQuestionIndex + 1]
      if (nextQ?.question_type === 'open' && currentOpenResponses[nextQ.id]) {
        setCurrentOpenResponse(currentOpenResponses[nextQ.id])
      }
    } else if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1)
      setCurrentQuestionIndex(0)
      const nextSection = sections[currentSectionIndex + 1]
      const nextQ = nextSection?.questions[0]
      if (nextQ?.question_type === 'open' && currentOpenResponses[nextQ.id]) {
        setCurrentOpenResponse(currentOpenResponses[nextQ.id])
      }
    } else {
      submitSurvey(currentAnswers, currentOpenResponses)
    }
  }

  const submitSurvey = async (finalAnswers: Record<string, number>, finalOpenResponses: Record<string, string>) => {
    setSubmitting(true)

    // Calculate section scores
    const sectionScores: Record<string, { score: number; max: number; percentage: number }> = {}
    let totalScore = 0
    let maxScore = 0

    sections.forEach(section => {
      let sectionTotal = 0
      let sectionMax = 0
      section.questions.forEach(q => {
        if (q.question_type === 'scale' && finalAnswers[q.id]) {
          sectionTotal += finalAnswers[q.id] * q.weight
          sectionMax += 4 * q.weight
        }
      })
      if (sectionMax > 0) {
        sectionScores[section.key] = {
          score: sectionTotal,
          max: sectionMax,
          percentage: Math.round((sectionTotal / sectionMax) * 100)
        }
        totalScore += sectionTotal
        maxScore += sectionMax
      }
    })

    const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

    // Save everything at once - only when complete
    const { error } = await supabase
      .from('ttc_responses')
      .insert({
        assessment_id: assessmentId,
        respondent_email: respondentInfo.email || null,
        respondent_name: respondentInfo.name || null,
        respondent_company: respondentInfo.company || null,
        respondent_department: respondentInfo.department || null,
        respondent_role: respondentInfo.role || null,
        company_size: respondentInfo.companySize || null,
        answers: finalAnswers,
        open_responses: finalOpenResponses,
        section_scores: sectionScores,
        overall_score: overallScore,
        completed_at: new Date().toISOString()
      })

    if (error) {
      console.error('Error saving response:', error)
      alert('Error saving your response. Please try again.')
      setSubmitting(false)
      return
    }

    router.push('/thank-you')
  }

  const goBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
      const prevQ = currentSection.questions[currentQuestionIndex - 1]
      if (prevQ?.question_type === 'open' && openResponses[prevQ.id]) {
        setCurrentOpenResponse(openResponses[prevQ.id])
      } else {
        setCurrentOpenResponse('')
      }
    } else if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1)
      const prevSection = sections[currentSectionIndex - 1]
      setCurrentQuestionIndex(prevSection.questions.length - 1)
      const prevQ = prevSection.questions[prevSection.questions.length - 1]
      if (prevQ?.question_type === 'open' && openResponses[prevQ.id]) {
        setCurrentOpenResponse(openResponses[prevQ.id])
      } else {
        setCurrentOpenResponse('')
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading survey...</p>
        </div>
      </div>
    )
  }

  if (step === 'intro') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
        <header className="bg-white shadow-sm">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center">
            <Image src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg" alt="The Tree Consultancy" width={40} height={40} />
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Before we begin</h1>
            <p className="text-gray-600">Tell us a bit about yourself (all fields are optional)</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-8">
            <p className="text-sm text-emerald-800">
              🔒 Your responses are confidential. Personal information will not be shared with your organization or any third party. Data is used only for aggregate analysis and improving organizational communication.
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Full Name <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={respondentInfo.name} onChange={(e) => setRespondentInfo({ ...respondentInfo, name: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="John Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="email" value={respondentInfo.email} onChange={(e) => setRespondentInfo({ ...respondentInfo, email: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="john@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company / Organization {clientInfo ? '' : <span className="text-gray-400 font-normal">(optional)</span>}
                </label>
                {clientInfo ? (
                  <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-medium">
                    {respondentInfo.company}
                    <span className="text-xs text-gray-400 ml-2">(pre-filled)</span>
                  </div>
                ) : (
                  <input type="text" value={respondentInfo.company} onChange={(e) => setRespondentInfo({ ...respondentInfo, company: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" placeholder="Acme Inc." />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Department <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={respondentInfo.department} onChange={(e) => setRespondentInfo({ ...respondentInfo, department: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white">
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map((dept) => (<option key={dept} value={dept}>{dept}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Position / Role <span className="text-gray-400 font-normal">(optional)</span></label>
                <select value={respondentInfo.role} onChange={(e) => setRespondentInfo({ ...respondentInfo, role: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white">
                  <option value="">Select role...</option>
                  {ROLES.map((role) => (<option key={role} value={role}>{role}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Size {clientInfo ? '' : <span className="text-gray-400 font-normal">(optional)</span>}
                </label>
                {clientInfo ? (
                  <div className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-medium">
                    {respondentInfo.companySize} employees
                    <span className="text-xs text-gray-400 ml-2">(pre-filled)</span>
                  </div>
                ) : (
                  <select value={respondentInfo.companySize} onChange={(e) => setRespondentInfo({ ...respondentInfo, companySize: e.target.value })} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white">
                    <option value="">Select company size...</option>
                    {COMPANY_SIZES.map((size) => (<option key={size} value={size}>{size} employees</option>))}
                  </select>
                )}
              </div>
              <button onClick={startSurvey} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors mt-4">
                Start Survey →
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  if (submitting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Saving your responses...</p>
        </div>
      </div>
    )
  }

  const isOpenQuestion = currentQuestion?.question_type === 'open'

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Image src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg" alt="The Tree Consultancy" width={40} height={40} />
          <div className="text-sm text-gray-500">{answeredQuestions} of {totalQuestions} questions</div>
        </div>
      </header>
      <div className="bg-gray-200 h-1">
        <div className="bg-emerald-600 h-1 transition-all duration-300" style={{ width: `${(answeredQuestions / totalQuestions) * 100}%` }} />
      </div>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <span className="text-4xl mb-2 block">{currentSection?.icon}</span>
          <h2 className="text-xl font-semibold text-gray-900">{currentSection?.name}</h2>
          <p className="text-sm text-gray-500 mt-1">Question {currentQuestionIndex + 1} of {currentSection?.questions.length}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h3 className="text-xl text-gray-900 mb-8 text-center leading-relaxed">{currentQuestion?.question_text}</h3>
          {isOpenQuestion ? (
            <div className="space-y-4">
              <textarea value={currentOpenResponse} onChange={(e) => setCurrentOpenResponse(e.target.value)} placeholder="Type your response here..." className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 min-h-[150px] resize-y" />
              <button onClick={handleOpenAnswer} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors">
                {currentSectionIndex === sections.length - 1 && currentQuestionIndex === currentSection.questions.length - 1 ? 'Complete Survey' : 'Continue →'}
              </button>
              <p className="text-xs text-gray-400 text-center">You can leave this blank and continue if you prefer</p>
            </div>
          ) : (
            <div className="space-y-3">
              {currentQuestion?.options.map((option) => (
                <button key={option.value} onClick={() => handleScaleAnswer(option.value)} className={`w-full p-4 text-left rounded-xl border-2 transition-all ${answers[currentQuestion.id] === option.value ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'}`}>
                  <div className="flex items-center">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mr-3 ${answers[currentQuestion.id] === option.value ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>{option.value}</span>
                    <span className="text-gray-700">{option.label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        {(currentSectionIndex > 0 || currentQuestionIndex > 0) && (
          <button onClick={goBack} className="text-gray-500 hover:text-gray-700 text-sm flex items-center mx-auto">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            Previous question
          </button>
        )}
      </div>
    </main>
  )
}
