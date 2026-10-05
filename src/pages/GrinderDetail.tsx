import { useEffect, useState } from 'react'
import type { AppState } from '../App'
import { CONFIDENCE_TEXT, ConfidenceBadge, Icon, MissingBadge } from '../components/ui'
import { canConvert, missingData } from '../lib/convert'
import { loadRevisions, type Revision } from '../lib/data'
import { formatSetting, SCALE_LABELS } from '../lib/scales'
import type { Grinder } from '../lib/types'

export const FIELD_LABELS: Partial<Record<keyof Grinder, string>> = {
  brand: 'Producent',
  model: 'Model',
  kind: 'Rodzaj',
  adjustment: 'Regulacja',
  range_min: 'Zakres min (µm)',
  range_max: 'Zakres max (µm)',
  range_source: 'Źródło zakresu',
  positions: 'Liczba pozycji skali',
  clicks_per_rotation: 'Kliki na obrót',
  um_per_click: 'µm na klik (przesunięcie żaren)',
  scale: 'Skala',
  scale_note: 'Opis skali',
  confidence: 'Pewność',
  notes: 'Uwagi i źródła',
}

export function scaleText(g: Grinder) {
  const s = g.scale
  const extra =
    s.type === 'rot_num_tick' ? ` – ${s.perRotation} klików/obrót, ${s.ticksPerNumber} kreski/numer`
    : s.type === 'rot_clicks' ? ` – ${s.perRotation} klików/obrót`
    : s.type === 'dial' ? ` – od ${s.start} co ${String(s.step).replace('.', ',')}${s.reversed ? ', numeracja odwrócona' : ''}`
    : s.type === 'num_sub' ? ` – ${s.sub} kroki na numer`
    : s.type === 'macro_micro' ? ` – ${s.micro} liter mikro`
    : s.type === 'continuous' ? ` – od ${s.from} do ${s.to}`
    : ''
  return SCALE_LABELS[s.type] + extra
}

export default function GrinderDetail({ grinders, myGrinder, setMyGrinder, id }: AppState & { id: string }) {
  const g = grinders.find((x) => x.id === id)
  const [revisions, setRevisions] = useState<Revision[]>([])
  useEffect(() => { loadRevisions(id).then(setRevisions).catch(() => {}) }, [id])

  if (!g) return <p className="notice bad">Nie ma takiego młynka. <a href="#/mlynki">Wróć do listy</a>.</p>

  const ok = canConvert(g)
  const missing = missingData(g)
  const isMine = g.id === myGrinder
  const n = g.positions ?? 0

  return (
    <div className="stack">
      <a href="#/mlynki" className="small">← Wszystkie młynki</a>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="muted">{g.brand}</div>
          <h1>{g.model}</h1>
        </div>
        {ok ? <ConfidenceBadge value={g.confidence} /> : <MissingBadge />}
      </div>

      {!ok && (
        <p className="notice bad">
          Nie da się jeszcze przeliczać nastawów dla tego młynka. Brakuje: <strong>{missing.join(', ')}</strong>.
          Znasz te dane? <a href={`#/zglos?id=${g.id}`}>Zaproponuj uzupełnienie</a>.
        </p>
      )}
      {ok && <p className="small muted">{CONFIDENCE_TEXT[g.confidence]}</p>}

      <div className="row">
        <button type="button" className={isMine ? '' : 'primary'} onClick={() => setMyGrinder(isMine ? '' : g.id)} disabled={!ok && !isMine}>
          <Icon.star filled={isMine} /> {isMine ? 'To Twój młynek' : 'Ustaw jako mój młynek'}
        </button>
        <a className="btn" href={`#/zglos?id=${g.id}`}>Zaproponuj poprawkę</a>
      </div>

      <section className="card">
        <dl className="data">
          <dt>Rodzaj</dt><dd>{g.kind === 'manual' ? 'ręczny' : 'elektryczny'}</dd>
          {g.adjustment && <><dt>Regulacja</dt><dd>{g.adjustment}</dd></>}
          <dt>Zakres cząstek</dt>
          <dd>{g.range_min != null && g.range_max != null ? `${g.range_min}–${g.range_max} µm` : '—'}{g.range_source && <span className="muted small"> ({g.range_source})</span>}</dd>
          <dt>Skala</dt><dd>{scaleText(g)}</dd>
          <dt>Pozycje</dt><dd>{n ? `${n} (${formatSetting(g, 0)} – ${formatSetting(g, n - 1)})` : g.scale.type === 'continuous' ? 'bezstopniowo' : '—'}</dd>
          {g.scale_note && <><dt>Odczyt skali</dt><dd>{g.scale_note}</dd></>}
          {g.um_per_click != null && <><dt>µm na klik</dt><dd>{g.um_per_click} µm <span className="muted small">(przesunięcie żaren – nie służy do przeliczeń)</span></dd></>}
          {g.notes && <><dt>Uwagi i źródła</dt><dd>{g.notes}</dd></>}
          <dt>Aktualizacja</dt><dd>{new Date(g.updated_at).toLocaleDateString('pl-PL')}</dd>
        </dl>
      </section>

      {revisions.length > 0 && (
        <section className="card stack" style={{ gap: 10 }}>
          <h2>Historia zmian</h2>
          {revisions.map((r) => (
            <div key={r.id} className="small">
              <strong>{new Date(r.created_at).toLocaleDateString('pl-PL')}</strong>{' '}
              {r.before ? 'zmiana: ' + changedFields(r).join(', ') : 'dodano młynek'}
              {r.source && <div className="muted">Źródło: {r.source}</div>}
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function changedFields(r: Revision): string[] {
  const keys = Object.keys(FIELD_LABELS) as (keyof Grinder)[]
  return keys
    .filter((k) => JSON.stringify(r.before?.[k]) !== JSON.stringify(r.after[k]))
    .map((k) => FIELD_LABELS[k]!)
}
