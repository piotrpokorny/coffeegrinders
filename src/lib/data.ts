import { supabase } from './supabase'
import { KEYS, read, write } from './storage'
import type { Grinder } from './types'

export type DataSource = 'online' | 'cache' | 'bundled'

export interface Revision {
  id: number
  grinder_id: string
  before: Partial<Grinder> | null
  after: Partial<Grinder>
  source: string | null
  created_at: string
}

export interface Submission {
  id: number
  type: 'edit' | 'new'
  grinder_id: string | null
  payload: Partial<Grinder>
  source: string
  contact: string | null
  status: 'pending' | 'approved' | 'rejected'
  mod_note: string | null
  created_at: string
}

const sortGrinders = (list: Grinder[]) =>
  [...list].sort((a, b) => (a.brand + a.model).localeCompare(b.brand + b.model, 'pl'))

async function bundled(): Promise<Grinder[]> {
  const res = await fetch('./grinders.json')
  return res.json()
}

/** Kolejność: Supabase → ostatnia kopia w przeglądarce → baza wbudowana w aplikację. */
export async function loadGrinders(): Promise<{ grinders: Grinder[]; source: DataSource }> {
  if (supabase && navigator.onLine) {
    const { data, error } = await supabase.from('grinders').select('*')
    if (!error && data?.length) {
      write(KEYS.cache, data)
      return { grinders: sortGrinders(data as Grinder[]), source: 'online' }
    }
  }
  const cached = read<Grinder[] | null>(KEYS.cache, null)
  if (cached?.length) return { grinders: sortGrinders(cached), source: 'cache' }
  return { grinders: sortGrinders(await bundled()), source: 'bundled' }
}

export async function loadRevisions(grinderId: string): Promise<Revision[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('grinder_revisions')
    .select('*')
    .eq('grinder_id', grinderId)
    .order('created_at', { ascending: false })
    .limit(20)
  return (data as Revision[]) ?? []
}

export async function submitProposal(input: {
  type: 'edit' | 'new'
  grinder_id: string | null
  payload: Partial<Grinder>
  source: string
  contact: string
}) {
  if (!supabase) throw new Error('Zgłoszenia nie są jeszcze skonfigurowane (brak połączenia z bazą).')
  const { error } = await supabase.from('submissions').insert({
    ...input,
    contact: input.contact || null,
  })
  if (error) throw new Error(error.message)
}

export async function loadPending(): Promise<Submission[]> {
  const { data, error } = await supabase!
    .from('submissions')
    .select('*')
    .eq('status', 'pending')
    .order('created_at')
  if (error) throw new Error(error.message)
  return data as Submission[]
}

export async function approve(id: number, payload: Partial<Grinder>, note: string) {
  const { error } = await supabase!.rpc('approve_submission', { sub_id: id, final_payload: payload, note: note || null })
  if (error) throw new Error(error.message)
}

export async function reject(id: number, note: string) {
  const { error } = await supabase!.rpc('reject_submission', { sub_id: id, note: note || null })
  if (error) throw new Error(error.message)
}

export function slugify(...parts: string[]) {
  return parts
    .join(' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
