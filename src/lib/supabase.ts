import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface Question {
  id: string
  assessment_type: string
  section_key: string
  section_name: string
  section_icon: string
  question_number: number
  question_text: string
  question_type: string
  options: { label: string; value: number }[]
  weight: number
  is_active: boolean
  sort_order: number
}

export interface Section {
  key: string
  name: string
  icon: string
  questions: Question[]
}

export interface Assessment {
  id: string
  client_id: string
  access_code: string
  started_at: string
  completed_at: string | null
  total_score: number | null
  max_possible_score: number | null
  percentage_score: number | null
  section_scores: Record<string, number> | null
}
