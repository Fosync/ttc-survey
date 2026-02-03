'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function Home() {
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Check if access code exists in assessments
      const { data: assessment, error: assessmentError } = await supabase
        .from('ttc_assessments')
        .select('*')
        .eq('access_code', accessCode.toUpperCase())
        .eq('status', 'active')
        .single()

      if (assessmentError || !assessment) {
        setError('Invalid access code. Please check and try again.')
        setLoading(false)
        return
      }

      // Create a new response session
      const sessionId = crypto.randomUUID()
      localStorage.setItem('ttc_session_id', sessionId)
      localStorage.setItem('ttc_assessment_id', assessment.id)

      router.push(`/survey/${assessment.id}?session=${sessionId}`)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image
            src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
            alt="The Tree Consultancy"
            width={120}
            height={120}
            className="mx-auto mb-6"
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Communication Health Check
          </h1>
          <p className="text-gray-600">
            Discover how well communication flows in your organisation
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="accessCode" className="block text-sm font-medium text-gray-700 mb-2">
                Enter your access code
              </label>
              <input
                type="text"
                id="accessCode"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
                placeholder="e.g. DEMO2026"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-center text-lg font-mono uppercase"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !accessCode}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {loading ? 'Starting...' : 'Start Survey'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500 text-center">
              This survey takes approximately 5-7 minutes to complete.
              Your responses are anonymous and confidential.
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}
