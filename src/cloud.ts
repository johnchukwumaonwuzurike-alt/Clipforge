import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const cloud: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null
export const cloudConfigured = Boolean(cloud)

export type CloudProject = {
  id: string
  name: string
  updated_at: string
}
