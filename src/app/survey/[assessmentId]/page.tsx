'use client'

import { useEffect, useState, use } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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

const COMPANY_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500+'
]

interface RespondentInfo {
  name: string
  email: string
  company: string
  department: string
  role: string
  companySize: string
}

export default function SurveyPage({ params }: { params: Promise<{ assessmentId: string }> }) {
  const { assessmentId } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const [step, setStep] = useState<'intro' | 'survey'>('intro')
  const [respondentInfo, setRespondentInfo] = useState<RespondentInfo>({
    name: '',
    email: '',
    company: '',
    department: '',
    role: '',
    companySize: ''
  })
  
  const [sections, setSections] = useState<Section[]>([])
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [responseId, setResponseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: questions, error } = await supabase
        .from('ttc_questions')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (error || !questions) {
        console.error('Error fetching questions:', error)
        return
      }

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
  }, [assessmentId])

  const startSurvey = async () => {
    const { data: response, error: responseError } = await supabase
      .from('ttc_responses')
      .insert({
        assessment_id: assessmentId,
        respondent_email: respondentInfo.email || null,
        respondent_name: respondentInfo.name || null,
        respondent_company: respondentInfo.company || null,
        respondent_department: respondentInfo.department || null,
        respondent_role: respondentInfo.role || null,
        company_size: respondentInfo.companySize || null,
        answers: {},
        section_scores: {},
        open_responses: {}
      })
      .select()
      .single()

    if (response) {
      setResponseId(response.id)
      setStep('survey')
    }
  }

  const currentSection = sections[currentSectionIndex]
  const currentQuestion = currentSection?.questions[currentQuestionIndex]
  const totalQuestions = sections.reduce((acc, s) => acc + s.questions.length, 0)
  const answeredQuestions = Object.keys(answers).length

  const handleAnswer = async (value: number) => {
    if (!currentQuestion || !responseId) return

    const newAnswers = { ...answers, [currentQuestion.id]: value }
    setAnswers(newAnswers)

    await supabase
      .from('ttc_responses')
      .update({ answers: newAnswers })
      .eq('id', responseId)

    if (currentQuestionIndex < currentSection.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1)
    } else if (currentSectionIndex < sections.length - 1) {
      setCurrentSectionIndex(currentSectionIndex + 1)
      setCurrentQuestionIndex(0)
    } else {
      await submitSurvey(newAnswers)
    }
  }

  const submitSurvey = async (finalAnswers: Record<string, number>) => {
    setSubmitting(true)

    const sectionScores: Record<string, { score: number; max: number; percentage: number }> = {}
    let totalScore = 0
    let maxScore = 0

    sections.forEach(section => {
      let sectionTotal = 0
      let sectionMax = 0
      section.questions.forEach(q => {
        if (finalAnswers[q.id]) {
          sectionTotal += finalAnswers[q.id] * q.weight
          sectionMax += 4 * q.weight
        }
      })
      sectionScores[section.key] = {
        score: sectionTotal,
        max: sectionMax,
        percentage: sectionMax > 0 ? Math.round((sectionTotal / sectionMax) * 100) : 0
      }
      totalScore += sectionTotal
      maxScore += sectionMax
    })

    const overallScore = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

    await supabase
      .from('ttc_responses')
      .update({
        answers: finalAnswers,
        section_scores: sectionScores,
        overall_score: overallScore,
        completed_at: new Date().toISOString()
      })
      .eq('id', responseId)

    router.push(`/results/${responseId}`)
  }

  const goBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1)
    } else if (currentSectionIndex > 0) {
      setCurrentSectionIndex(currentSectionIndex - 1)
      const prevSection = sections[currentSectionIndex - 1]
      setCurrentQuestionIndex(prevSection.questions.length - 1)
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
            <Image
              src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
              alt="The Tree Consultancy"
              width={40}
              height={40}
            />
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Before we begin</h1>
            <p className="text-gray-600">Tell us a bit about yourself (all fields are optional)</p>
          </div>

          {/* Privacy Notice */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-8">
            <p className="text-sm text-emerald-800">
              🔒 Your responses are confidential. Personal information will not be shared with your organization or any third party. Data is used only for aggregate analysis and improving organizational communication.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="space-y-6">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={respondentInfo.name}
                  onChange={(e) => setRespondentInfo({ ...respondentInfo, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="John Smith"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={respondentInfo.email}
                  onChange={(e) => setRespondentInfo({ ...respondentInfo, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="john@company.com"
                />
              </div>

              {/* Company */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company / Organization <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={respondentInfo.company}
                  onChange={(e) => setRespondentInfo({ ...respondentInfo, company: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Acme Inc."
                />
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Department <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={respondentInfo.department}
                  onChange={(e) => setRespondentInfo({ ...respondentInfo, department: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                >
                  <option value="">Select department...</option>
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Position / Role <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={respondentInfo.role}
                  onChange={(e) => setRespondentInfo({ ...respondentInfo, role: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                >
                  <option value="">Select role...</option>
                  {ROLES.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </div>

              {/* Company Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Size <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select
                  value={respondentInfo.companySize}
                  onChange={(e) => setRespondentInfo({ ...respondentInfo, companySize: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                >
                  <option value="">Select company size...</option>
                  {COMPANY_SIZES.map((size) => (
                    <option key={size} value={size}>{size} employees</option>
                  ))}
                </select>
              </div>

              <button
                onClick={startSurvey}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors mt-4"
              >
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
          <p className="mt-4 text-gray-600">Calculating your results...</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white">
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <Image
            src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
            alt="The Tree Consultancy"
            width={40}
            height={40}
          />
          <div className="text-sm text-gray-500">
            {answeredQuestions} of {totalQuestions} questions
          </div>
        </div>
      </header>

      <div className="bg-gray-200 h-1">
        <div
          className="bg-emerald-600 h-1 transition-all duration-300"
          style={{ width: `${(answeredQuestions / totalQuestions) * 100}%` }}
        />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <span className="text-4xl mb-2 block">{currentSection?.icon}</span>
          <h2 className="text-xl font-semibold text-gray-900">{currentSection?.name}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Question {currentQuestionIndex + 1} of {currentSection?.questions.length}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 mb-6">
          <h3 className="text-xl text-gray-900 mb-8 text-center leading-relaxed">
            {currentQuestion?.question_text}
          </h3>

          <div className="space-y-3">
            {currentQuestion?.options.map((option) => (
              <button
                key={option.value}
                onClick={() => handleAnswer(option.value)}
                className={`w-full p-4 text-left rounded-xl border-2 transition-all ${
                  answers[currentQuestion.id] === option.value
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                }`}
              >
                <div className="flex items-center">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mr-3 ${
                    answers[currentQuestion.id] === option.value
                      ? 'bg-emerald-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {option.value}
                  </span>
                  <span className="text-gray-700">{option.label}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {(currentSectionIndex > 0 || currentQuestionIndex > 0) && (
          <button
            onClick={goBack}
            className="text-gray-500 hover:text-gray-700 text-sm flex items-center mx-auto"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Previous question
          </button>
        )}
      </div>
    </main>
  )
}
