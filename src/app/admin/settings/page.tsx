'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import Link from 'next/link'

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

interface Settings {
  ai_language: 'en' | 'tr'
  ai_model: string
  individual_prompt_en: string
  individual_prompt_tr: string
  company_prompt_en: string
  company_prompt_tr: string
}

export default function AISettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'individual' | 'company'>('individual')
  const router = useRouter()

  const [settings, setSettings] = useState<Settings>({
    ai_language: 'en',
    ai_model: 'gemini-1.5-pro',
    individual_prompt_en: DEFAULT_PROMPTS.individual.en,
    individual_prompt_tr: DEFAULT_PROMPTS.individual.tr,
    company_prompt_en: DEFAULT_PROMPTS.company.en,
    company_prompt_tr: DEFAULT_PROMPTS.company.tr
  })

  useEffect(() => {
    const isAuth = localStorage.getItem('ttc_admin_auth')
    if (isAuth !== 'true') {
      router.push('/admin')
      return
    }
    loadSettings()
  }, [router])

  const loadSettings = async () => {
    const { data } = await supabase
      .from('ttc_settings')
      .select('*')
      .single()

    if (data) {
      setSettings({
        ai_language: data.ai_language || 'en',
        ai_model: data.ai_model || 'gemini-1.5-pro',
        individual_prompt_en: data.individual_prompt_en || DEFAULT_PROMPTS.individual.en,
        individual_prompt_tr: data.individual_prompt_tr || DEFAULT_PROMPTS.individual.tr,
        company_prompt_en: data.company_prompt_en || DEFAULT_PROMPTS.company.en,
        company_prompt_tr: data.company_prompt_tr || DEFAULT_PROMPTS.company.tr
      })
    }
    setLoading(false)
  }

  const saveSettings = async () => {
    setSaving(true)

    // Upsert settings
    const { error } = await supabase
      .from('ttc_settings')
      .upsert({
        id: 1, // Single row for settings
        ...settings,
        updated_at: new Date().toISOString()
      })

    if (error) {
      alert('Error saving settings: ' + error.message)
    } else {
      alert('Settings saved successfully!')
    }
    setSaving(false)
  }

  const resetToDefaults = () => {
    if (confirm('Reset all prompts to defaults?')) {
      setSettings({
        ...settings,
        individual_prompt_en: DEFAULT_PROMPTS.individual.en,
        individual_prompt_tr: DEFAULT_PROMPTS.individual.tr,
        company_prompt_en: DEFAULT_PROMPTS.company.en,
        company_prompt_tr: DEFAULT_PROMPTS.company.tr
      })
    }
  }

  const testAI = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const testData = {
        type: activeTab,
        language: settings.ai_language,
        customPrompt: activeTab === 'individual'
          ? (settings.ai_language === 'en' ? settings.individual_prompt_en : settings.individual_prompt_tr)
          : (settings.ai_language === 'en' ? settings.company_prompt_en : settings.company_prompt_tr),
        data: activeTab === 'individual' ? {
          overallScore: 3.25,
          department: 'Marketing',
          role: 'Manager',
          sectionScores: {
            work_changes: 3.5,
            finding_info: 2.8,
            speaking_up: 3.2,
            cross_team: 2.5,
            leadership: 3.8,
            during_change: 2.9,
            culture: 3.4,
            overload: 3.0
          }
        } : {
          overallScore: 3.1,
          companyName: 'Test Company',
          totalResponses: 50,
          sectionScores: {
            work_changes: 3.2,
            finding_info: 2.9,
            speaking_up: 3.0,
            cross_team: 2.8,
            leadership: 3.5,
            during_change: 2.7,
            culture: 3.3,
            overload: 2.6
          },
          departmentBreakdown: {
            'Marketing': { count: 15, avgScore: 3.4 },
            'Engineering': { count: 20, avgScore: 2.9 },
            'Sales': { count: 15, avgScore: 3.2 }
          },
          roleBreakdown: {
            'Executive': { count: 5, avgScore: 3.8 },
            'Manager': { count: 15, avgScore: 3.3 },
            'Staff': { count: 30, avgScore: 2.8 }
          }
        }
      }

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      })

      const result = await response.json()

      if (result.error) {
        setTestResult(`Error: ${result.error}`)
      } else {
        setTestResult(result.analysis)
      }
    } catch (error) {
      setTestResult(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }

    setTesting(false)
  }

  const getCurrentPrompt = () => {
    if (activeTab === 'individual') {
      return settings.ai_language === 'en' ? settings.individual_prompt_en : settings.individual_prompt_tr
    }
    return settings.ai_language === 'en' ? settings.company_prompt_en : settings.company_prompt_tr
  }

  const setCurrentPrompt = (value: string) => {
    if (activeTab === 'individual') {
      if (settings.ai_language === 'en') {
        setSettings({ ...settings, individual_prompt_en: value })
      } else {
        setSettings({ ...settings, individual_prompt_tr: value })
      }
    } else {
      if (settings.ai_language === 'en') {
        setSettings({ ...settings, company_prompt_en: value })
      } else {
        setSettings({ ...settings, company_prompt_tr: value })
      }
    }
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
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Image
              src="https://aciqagqaiwsqerczchnx.supabase.co/storage/v1/object/public/assets/3.svg"
              alt="TTC"
              width={50}
              height={50}
            />
            <div>
              <h1 className="font-bold text-lg text-gray-900">AI Settings</h1>
              <p className="text-sm text-gray-500">Configure Gemini AI analysis</p>
            </div>
          </div>
          <Link href="/admin/dashboard" className="text-slate-600 hover:text-slate-900 text-sm font-medium">
            ← Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">General Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Language</label>
              <select
                value={settings.ai_language}
                onChange={(e) => setSettings({ ...settings, ai_language: e.target.value as 'en' | 'tr' })}
                className="w-full px-4 py-2 border rounded-lg bg-white"
              >
                <option value="en">English</option>
                <option value="tr">Turkce</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">AI Model</label>
              <select
                value={settings.ai_model}
                onChange={(e) => setSettings({ ...settings, ai_model: e.target.value })}
                className="w-full px-4 py-2 border rounded-lg bg-white"
              >
                <option value="gemini-1.5-pro">Gemini 1.5 Pro (Recommended)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash (Faster)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setActiveTab('individual')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'individual'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Individual Analysis
            </button>
            <button
              onClick={() => setActiveTab('company')}
              className={`px-4 py-2 rounded-lg font-medium ${
                activeTab === 'company'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Company Report
            </button>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {activeTab === 'individual' ? 'Individual Analysis' : 'Company Report'} Prompt
              ({settings.ai_language === 'en' ? 'English' : 'Turkish'})
            </label>
            <textarea
              value={getCurrentPrompt()}
              onChange={(e) => setCurrentPrompt(e.target.value)}
              className="w-full px-4 py-3 border rounded-lg font-mono text-sm h-64 resize-y"
              placeholder="Enter your custom prompt..."
            />
            <p className="text-xs text-gray-500 mt-1">
              The survey data will be automatically appended to this prompt.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              onClick={resetToDefaults}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium"
            >
              Reset to Defaults
            </button>
            <button
              onClick={testAI}
              disabled={testing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium"
            >
              {testing ? 'Testing...' : 'Test AI'}
            </button>
          </div>
        </div>

        {testResult && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Test Result</h3>
            <div className="bg-slate-50 rounded-lg p-4 whitespace-pre-wrap text-sm">
              {testResult}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
