export interface Show {
  id: string
  slug: string
  name_he: string
  name_en: string
  type: 'elimination_score' | 'time_trial'
}

export interface Season {
  id: string
  show_id: string
  number: number
  name_he: string
  status: 'upcoming' | 'active' | 'completed'
  show: Show
}

export interface Question {
  id: string
  episode_id: string
  type: 'categorical' | 'numeric'
  text_he: string
  options?: string[]
  status: 'open' | 'locked' | 'resolved' | 'voided'
}

export interface Episode {
  id: string
  season_id: string
  number: number
  title_he?: string
  scheduled_air_time: string
  status: 'upcoming' | 'locked' | 'completed'
  season?: Season & { show?: Show }
  questions?: Question[]
}
