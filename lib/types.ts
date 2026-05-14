export interface Show {
  id: string
  slug: string
  name_he: string
  name_en: string
  type: 'elimination_score' | 'time_trial'
  created_at: string
}

export interface Season {
  id: string
  show_id: string
  number: number
  name_he: string
  status: 'upcoming' | 'active' | 'completed'
  start_date: string | null
  end_date: string | null
  created_at: string
  show?: Show
}

export interface Episode {
  id: string
  season_id: string
  number: number
  title_he: string | null
  scheduled_air_time: string
  status: 'upcoming' | 'locked' | 'completed'
  locked_at: string | null
  created_at: string
}

export interface Question {
  id: string
  episode_id: string
  type: 'categorical' | 'numeric'
  text_he: string
  options: string[] | null
  correct_answer: string | null
  entry_fee: number
  payout_multiplier: number
  tolerance_unit: number | null
  max_steps: number | null
  status: 'open' | 'locked' | 'resolved' | 'voided'
  display_order: number
  created_at: string
}

export interface Profile {
  id: string
  display_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface SeasonWallet {
  id: string
  user_id: string
  season_id: string
  balance: number
  created_at: string
  user?: Profile
}

export interface Prediction {
  id: string
  user_id: string
  question_id: string
  answer: string
  fee_paid: number
  points_earned: number | null
  created_at: string
  updated_at: string
}
