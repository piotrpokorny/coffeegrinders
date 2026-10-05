import { useState } from 'react'
import type { AppState } from '../App'
import { ConfidenceBadge, Icon, MissingBadge } from '../components/ui'
import { canConvert } from '../lib/convert'

export default function Grinders({ grinders, myGrinder }: AppState) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')

  const needle = q.trim().toLowerCase()
  const list = grinders.filter((g) => {
    if (needle && !`${g.brand} ${g.model}`.toLowerCase().includes(needle)) return false
    if (kind && g.kind !== kind) return false
    if (status === 'ok' && !canConvert(g)) return false
    if (status === 'missing' && canConvert(g)) return false
    if (['A', 'B', 'C'].includes(status) && (g.confidence !== status || !canConvert(g))) return false
    return true
  })
  const missingCount = grinders.filter((g) => !canConvert(g)).length

  return (
    <div className="stack">
      <div>
        <h1>Młynki</h1>
        <p className="muted">
          {grinders.length} modeli, {grinders.length - missingCount} gotowych do przeliczeń.
          {missingCount > 0 && <> Brakuje danych dla {missingCount} – <a href="#/zglos">uzupełnij</a>.</>}
        </p>
      </div>

      <div className="filters">
        <input type="search" placeholder="Szukaj: Comandante, K6, Encore…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Szukaj młynka" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Rodzaj">
          <option value="">Wszystkie</option>
          <option value="manual">Ręczne</option>
          <option value="electric">Elektryczne</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Dane">
          <option value="">Dowolne dane</option>
          <option value="ok">Gotowe do przeliczeń</option>
          <option value="A">Pewność A</option>
          <option value="B">Pewność B</option>
          <option value="C">Pewność C</option>
          <option value="missing">Brak danych</option>
        </select>
      </div>

      <div className="list">
        {list.map((g) => {
          const ok = canConvert(g)
          return (
            <a key={g.id} className={`item ${ok ? '' : 'incomplete'}`} href={`#/mlynek/${g.id}`}>
              <span>
                <span className="name">{g.brand} {g.model}</span>
                {g.id === myGrinder && <span className="star" title="Twój młynek"> <Icon.star filled /></span>}
                <br />
                <span className="muted small">{g.kind === 'manual' ? 'ręczny' : 'elektryczny'}{g.adjustment ? ` · ${g.adjustment}` : ''}</span>
              </span>
              {ok ? <ConfidenceBadge value={g.confidence} /> : <MissingBadge />}
            </a>
          )
        })}
        {!list.length && <p className="muted">Nic nie znaleziono. <a href="#/zglos">Dodaj nowy młynek</a>.</p>}
      </div>
    </div>
  )
}
