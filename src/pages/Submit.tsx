import { useEffect, useState } from 'react'
import type { AppState } from '../App'
import GrinderForm, { diffDraft, emptyDraft, validateDraft, type Draft } from '../components/GrinderForm'
import { GrinderSelect, grinderName } from '../components/ui'
import { slugify, submitProposal } from '../lib/data'
import { supabase } from '../lib/supabase'
import type { Grinder } from '../lib/types'

const toDraft = ({ updated_at: _u, ...rest }: Grinder): Draft => rest

export default function Submit({ grinders, grinderId }: AppState & { grinderId: string | null }) {
  const [mode, setMode] = useState<'edit' | 'new'>('edit')
  const [targetId, setTargetId] = useState(grinderId ?? '')
  const base = grinders.find((g) => g.id === targetId)
  const [draft, setDraft] = useState<Draft>(base ? toDraft(base) : emptyDraft())
  const [source, setSource] = useState('')
  const [contact, setContact] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [status, setStatus] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (grinderId) { setMode('edit'); setTargetId(grinderId) }
  }, [grinderId])
  useEffect(() => {
    setDraft(mode === 'edit' && base ? toDraft(base) : emptyDraft())
    setStatus(null)
  }, [mode, targetId]) // eslint-disable-line react-hooks/exhaustive-deps

  const changes = mode === 'edit' && base ? diffDraft(toDraft(base), draft) : null
  const duplicate = mode === 'new' && grinders.some((g) => g.id === slugify(draft.brand, draft.model))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (honeypot) return // bot
    const invalid = validateDraft(draft)
    if (invalid) return setStatus({ kind: 'bad', text: invalid })
    if (source.trim().length < 5) return setStatus({ kind: 'bad', text: 'Podaj źródło danych (link albo opis pomiaru).' })
    if (changes && !Object.keys(changes).length) return setStatus({ kind: 'bad', text: 'Nie wprowadzono żadnych zmian.' })
    if (duplicate) return setStatus({ kind: 'bad', text: 'Ten młynek już jest w bazie – wybierz „Poprawka istniejącego”.' })

    setBusy(true)
    try {
      const { confidence: _c, ...payload } = mode === 'new' ? { ...draft, id: slugify(draft.brand, draft.model) } : changes!
      await submitProposal({
        type: mode,
        grinder_id: mode === 'edit' ? targetId : null,
        payload,
        source: source.trim(),
        contact: contact.trim(),
      })
      setStatus({ kind: 'ok', text: 'Dziękujemy! Zgłoszenie trafiło do moderacji – po zatwierdzeniu pojawi się w aplikacji.' })
      setSource('')
      if (mode === 'new') setDraft(emptyDraft())
    } catch (err) {
      setStatus({ kind: 'bad', text: err instanceof Error ? err.message : 'Nie udało się wysłać zgłoszenia.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit} noValidate>
      <div>
        <h1>Uzupełnij dane</h1>
        <p className="muted">
          Baza powstaje jak wiki: każdy może zaproponować poprawkę lub nowy młynek, a moderator sprawdza źródło i zatwierdza zmianę.
        </p>
      </div>

      {!supabase && (
        <p className="notice warn">Wysyłanie zgłoszeń nie jest jeszcze włączone w tej wersji aplikacji.</p>
      )}

      <div className="row" role="radiogroup" aria-label="Rodzaj zgłoszenia">
        <button type="button" role="radio" aria-checked={mode === 'edit'} className={mode === 'edit' ? 'primary' : ''} onClick={() => setMode('edit')}>
          Poprawka istniejącego
        </button>
        <button type="button" role="radio" aria-checked={mode === 'new'} className={mode === 'new' ? 'primary' : ''} onClick={() => setMode('new')}>
          Nowy młynek
        </button>
      </div>

      {mode === 'edit' && (
        <label className="field">
          Młynek
          <GrinderSelect grinders={grinders} value={targetId} onChange={setTargetId} allowIncomplete />
        </label>
      )}

      {(mode === 'new' || base) && (
        <>
          <GrinderForm value={draft} onChange={setDraft} isNew={mode === 'new'} />
          {duplicate && <p className="notice warn">{draft.brand} {draft.model} już jest w bazie.</p>}

          <label className="field">
            Źródło danych (wymagane)
            <textarea
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Link do specyfikacji / recenzji albo opis pomiaru (np. sita Kruve, 3 próby)"
            />
            <span className="hint">Bez źródła moderator nie zatwierdzi zmiany.</span>
          </label>
          <label className="field">
            Kontakt (opcjonalnie)
            <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="nick lub e-mail – jeśli moderator ma pytania" />
            <span className="hint">Nie publikujemy go w aplikacji.</span>
          </label>
          <label className="hp" aria-hidden="true">
            Strona www
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>

          {changes && Object.keys(changes).length > 0 && (
            <p className="small muted">Zmieniasz {Object.keys(changes).length} pól w: {grinderName(base!)}.</p>
          )}
          {status && <p className={`notice ${status.kind}`} role="status">{status.text}</p>}
          <button type="submit" className="primary" disabled={busy || !supabase}>
            {busy ? 'Wysyłanie…' : 'Wyślij do moderacji'}
          </button>
        </>
      )}
    </form>
  )
}
