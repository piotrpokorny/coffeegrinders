import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import type { AppState } from '../App'
import GrinderForm, { diffDraft, emptyDraft, validateDraft, type Draft } from '../components/GrinderForm'
import { grinderName } from '../components/ui'
import { approve, loadPending, reject, type Submission } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Grinder } from '../lib/types'
import { FIELD_LABELS } from './GrinderDetail'

export default function Moderation(props: AppState) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!supabase) return <p className="notice warn">Panel moderacji wymaga połączenia z Supabase (zmienne VITE_SUPABASE_*).</p>
  if (!ready) return <p className="muted">Sprawdzanie sesji…</p>
  if (!session) return <Login />
  return <Queue {...props} session={session} />
}

function Login() {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const redirect = window.location.href.split('#')[0] + '#/mod'
    const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
    setMsg(error ? error.message : 'Sprawdź skrzynkę – wysłaliśmy link do logowania.')
  }
  return (
    <form className="stack card" onSubmit={send}>
      <h1>Moderacja</h1>
      <label className="field">
        E-mail moderatora
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </label>
      <button className="primary" type="submit">Wyślij link do logowania</button>
      {msg && <p className="notice info">{msg}</p>}
    </form>
  )
}

function Queue({ grinders, reload, session }: AppState & { session: Session }) {
  const [items, setItems] = useState<Submission[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    loadPending().then(setItems).catch((e) => setError(e.message))
  }, [])
  useEffect(refresh, [refresh])

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1>Moderacja</h1>
        <button type="button" className="ghost" onClick={() => supabase!.auth.signOut()}>Wyloguj</button>
      </div>
      <p className="small muted">Zalogowano: {session.user.email}</p>
      {error && <p className="notice bad">{error}</p>}
      {items && !items.length && (
        <p className="notice info">
          Brak oczekujących zgłoszeń. Jeśli wiesz, że jakieś są, a lista jest pusta – Twoje konto nie jest jeszcze w tabeli
          <code> moderators</code> (id: <code>{session.user.id}</code>).
        </p>
      )}
      {items?.map((s) => (
        <Item key={s.id} sub={s} base={grinders.find((g) => g.id === s.grinder_id)} onDone={() => { refresh(); reload() }} />
      ))}
    </div>
  )
}

function Item({ sub, base, onDone }: { sub: Submission; base?: Grinder; onDone: () => void }) {
  const start: Draft = { ...(base ? stripUpdated(base) : emptyDraft()), ...(sub.payload as Partial<Draft>) }
  const [draft, setDraft] = useState<Draft>(start)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const baseDraft = base ? stripUpdated(base) : emptyDraft()
  const diff = diffDraft(baseDraft, draft)

  async function act(kind: 'approve' | 'reject') {
    setBusy(true)
    setError(null)
    try {
      if (kind === 'approve') {
        const invalid = validateDraft(draft)
        if (invalid) throw new Error(invalid)
        await approve(sub.id, sub.type === 'new' ? draft : diff, note)
      } else {
        await reject(sub.id, note)
      }
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Błąd')
      setBusy(false)
    }
  }

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div>
        <span className="badge B">{sub.type === 'new' ? 'nowy młynek' : 'poprawka'}</span>{' '}
        <strong>{base ? grinderName(base) : `${draft.brand} ${draft.model}`}</strong>
        <div className="small muted">{new Date(sub.created_at).toLocaleString('pl-PL')}{sub.contact && ` · kontakt: ${sub.contact}`}</div>
      </div>
      <div className="notice info small"><strong>Źródło:</strong> {linkify(sub.source)}</div>

      <div className="table-wrap">
        <table className="diff">
          <thead><tr><th>Pole</th><th>Teraz</th><th>Po zmianie</th></tr></thead>
          <tbody>
            {(Object.keys(diff) as (keyof Draft)[]).map((k) => (
              <tr key={k}>
                <th>{FIELD_LABELS[k as keyof Grinder] ?? k}</th>
                <td className="old">{show(baseDraft[k])}</td>
                <td className="new">{show(draft[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details open={editing} onToggle={(e) => setEditing((e.target as HTMLDetailsElement).open)}>
        <summary>Popraw przed zatwierdzeniem / ustaw pewność</summary>
        <div style={{ marginTop: 12 }}>
          <GrinderForm value={draft} onChange={setDraft} isNew={sub.type === 'new'} moderator />
        </div>
      </details>

      <label className="field">
        Notatka moderatora
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="opcjonalnie – np. powód odrzucenia" />
      </label>
      {error && <p className="notice bad">{error}</p>}
      <div className="row">
        <button type="button" className="primary" disabled={busy} onClick={() => act('approve')}>Zatwierdź</button>
        <button type="button" className="danger" disabled={busy} onClick={() => act('reject')}>Odrzuć</button>
      </div>
    </section>
  )
}

const stripUpdated = ({ updated_at: _u, ...rest }: Grinder): Draft => rest

function show(v: unknown) {
  if (v == null || v === '') return '—'
  return typeof v === 'object' ? JSON.stringify(v) : String(v)
}

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a> : part,
  )
}
