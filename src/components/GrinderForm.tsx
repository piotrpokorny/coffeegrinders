import { SCALE_LABELS } from '../lib/scales'
import type { Grinder, Scale, ScaleType } from '../lib/types'

export type Draft = Omit<Grinder, 'updated_at'>

export const emptyDraft = (): Draft => ({
  id: '',
  brand: '',
  model: '',
  kind: 'manual',
  adjustment: null,
  range_min: null,
  range_max: null,
  range_source: null,
  positions: null,
  clicks_per_rotation: null,
  um_per_click: null,
  scale: { type: 'clicks', start: 0 },
  scale_note: null,
  confidence: 'C',
  notes: null,
})

const DEFAULT_SCALES: Record<ScaleType, Scale> = {
  clicks: { type: 'clicks', start: 0 },
  dial: { type: 'dial', start: 1, step: 1 },
  rot_num_tick: { type: 'rot_num_tick', perRotation: 100, ticksPerNumber: 10 },
  rot_clicks: { type: 'rot_clicks', perRotation: 60 },
  num_sub: { type: 'num_sub', start: 1, sub: 3 },
  macro_micro: { type: 'macro_micro', macroStart: 1, micro: 9 },
  continuous: { type: 'continuous', from: 0, to: 10, decimals: 1 },
  unknown: { type: 'unknown' },
}

/** Pola zmienione względem wersji bazowej – tylko je wysyłamy w zgłoszeniu poprawki. */
export function diffDraft(base: Draft, draft: Draft): Partial<Draft> {
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(draft) as (keyof Draft)[]) {
    if (JSON.stringify(base[k]) !== JSON.stringify(draft[k])) out[k] = draft[k]
  }
  return out as Partial<Draft>
}

export function validateDraft(d: Draft): string | null {
  if (!d.brand.trim() || !d.model.trim()) return 'Podaj producenta i model.'
  if (d.range_min != null && d.range_max != null && d.range_max <= d.range_min) return 'Zakres max musi być większy niż min.'
  if (d.positions != null && (d.positions < 2 || !Number.isInteger(d.positions))) return 'Liczba pozycji musi być liczbą całkowitą ≥ 2.'
  return null
}

function NumberField({ label, hint, value, onChange, step = 'any' }: {
  label: string; hint?: string; value: number | null; onChange: (v: number | null) => void; step?: string
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

function TextField({ label, hint, value, onChange, multiline }: {
  label: string; hint?: string; value: string | null; onChange: (v: string | null) => void; multiline?: boolean
}) {
  const props = { value: value ?? '', onChange: (e: { target: { value: string } }) => onChange(e.target.value || null) }
  return (
    <label className="field">
      {label}
      {multiline ? <textarea {...props} /> : <input {...props} />}
      {hint && <span className="hint">{hint}</span>}
    </label>
  )
}

function ScaleEditor({ scale, onChange }: { scale: Scale; onChange: (s: Scale) => void }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...scale, ...patch } as Scale)
  const num = (k: string, label: string, hint?: string) => (
    <NumberField
      label={label}
      hint={hint}
      value={(scale as Record<string, unknown>)[k] as number}
      onChange={(v) => set({ [k]: v ?? 0 })}
    />
  )
  return (
    <div className="stack" style={{ gap: 12 }}>
      <label className="field">
        Typ skali
        <select value={scale.type} onChange={(e) => onChange(DEFAULT_SCALES[e.target.value as ScaleType])}>
          {(Object.keys(SCALE_LABELS) as ScaleType[]).map((t) => (
            <option key={t} value={t}>{SCALE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      <div className="grid2">
        {scale.type === 'clicks' && num('start', 'Pierwszy klik', 'Zwykle 0 (zamknięte żarna).')}
        {scale.type === 'dial' && <>{num('start', 'Pierwszy numer (najdrobniej)')}{num('step', 'Krok numeracji', 'np. 1 albo 0,5')}</>}
        {scale.type === 'dial' && (
          <label className="field">
            Numeracja
            <select value={scale.reversed ? 'r' : ''} onChange={(e) => set({ reversed: e.target.value === 'r' })}>
              <option value="">Wyższy numer = grubiej</option>
              <option value="r">Odwrócona: wyższy numer = drobniej</option>
            </select>
          </label>
        )}
        {scale.type === 'rot_num_tick' && <>{num('perRotation', 'Kliki na obrót')}{num('ticksPerNumber', 'Kreski między numerami')}</>}
        {scale.type === 'rot_clicks' && num('perRotation', 'Kliki na obrót')}
        {scale.type === 'num_sub' && <>{num('start', 'Pierwszy numer')}{num('sub', 'Kroki na numer')}</>}
        {scale.type === 'macro_micro' && <>{num('macroStart', 'Pierwsze makro')}{num('micro', 'Liczba liter mikro')}</>}
        {scale.type === 'continuous' && <>{num('from', 'Skala od')}{num('to', 'Skala do')}{num('decimals', 'Miejsca po przecinku')}</>}
      </div>
    </div>
  )
}

export default function GrinderForm({ value, onChange, isNew, moderator }: {
  value: Draft
  onChange: (d: Draft) => void
  isNew: boolean
  moderator?: boolean
}) {
  const set = <K extends keyof Draft>(k: K) => (v: Draft[K]) => onChange({ ...value, [k]: v })
  return (
    <div className="stack">
      {(isNew || moderator) && (
        <div className="grid2">
          <TextField label="Producent" value={value.brand} onChange={(v) => set('brand')(v ?? '')} />
          <TextField label="Model" value={value.model} onChange={(v) => set('model')(v ?? '')} />
        </div>
      )}
      <div className="grid2">
        <label className="field">
          Rodzaj
          <select value={value.kind} onChange={(e) => set('kind')(e.target.value as Draft['kind'])}>
            <option value="manual">ręczny</option>
            <option value="electric">elektryczny</option>
          </select>
        </label>
        <TextField label="Rodzaj regulacji" hint="np. kliki, pokrętło, stepless" value={value.adjustment} onChange={set('adjustment')} />
      </div>

      <fieldset className="card stack" style={{ gap: 12 }}>
        <legend><strong>Zakres mielenia</strong></legend>
        <p className="small muted" style={{ margin: 0 }}>
          Rozmiar cząstek (µm) przy najdrobniejszym i najgrubszym nastawie – to podstawa przeliczeń.
        </p>
        <div className="grid2">
          <NumberField label="Min (µm)" value={value.range_min} onChange={set('range_min')} />
          <NumberField label="Max (µm)" value={value.range_max} onChange={set('range_max')} />
        </div>
        <TextField label="Skąd zakres?" hint="np. pomiar sitami, honestcoffeeguide.com" value={value.range_source} onChange={set('range_source')} />
      </fieldset>

      <fieldset className="card stack" style={{ gap: 12 }}>
        <legend><strong>Skala nastawów</strong></legend>
        <ScaleEditor scale={value.scale} onChange={set('scale')} />
        <div className="grid2">
          <NumberField label="Łączna liczba pozycji" hint="Od najdrobniejszej do najgrubszej, włącznie." step="1" value={value.positions} onChange={set('positions')} />
          <NumberField label="Kliki na obrót" step="1" value={value.clicks_per_rotation} onChange={set('clicks_per_rotation')} />
        </div>
        <NumberField label="µm na klik (przesunięcie żaren)" hint="Informacyjnie – nie służy do przeliczeń." value={value.um_per_click} onChange={set('um_per_click')} />
        <TextField label="Jak odczytać skalę" hint="np. obroty.kliki (2.42 = 2 obroty + 42. klik)" value={value.scale_note} onChange={set('scale_note')} />
      </fieldset>

      <TextField label="Uwagi" multiline value={value.notes} onChange={set('notes')} />

      {moderator && (
        <label className="field">
          Pewność danych (ustala moderator)
          <select value={value.confidence} onChange={(e) => set('confidence')(e.target.value as Draft['confidence'])}>
            <option value="A">A – oficjalna specyfikacja producenta</option>
            <option value="B">B – recenzje / testy, potwierdzone źródłem</option>
            <option value="C">C – niepotwierdzone / przybliżone</option>
          </select>
        </label>
      )}
    </div>
  )
}
