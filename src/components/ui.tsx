import { canConvert } from '../lib/convert'
import type { Confidence, Grinder } from '../lib/types'

export const CONFIDENCE_TEXT: Record<Confidence, string> = {
  A: 'Pewność A – dane z oficjalnej specyfikacji producenta.',
  B: 'Pewność B – dane z recenzji lub testów, potwierdzone w co najmniej jednym źródle.',
  C: 'Pewność C – dane niepotwierdzone lub przybliżone. Traktuj wynik jako punkt startowy.',
}

export function ConfidenceBadge({ value }: { value: Confidence }) {
  return (
    <span className={`badge ${value}`} title={CONFIDENCE_TEXT[value]}>
      {value}
    </span>
  )
}

export function MissingBadge() {
  return <span className="badge missing">brak danych</span>
}

export const grinderName = (g: Grinder) => `${g.brand} ${g.model}`

/** Natywna lista (najwygodniejsza na telefonie) pogrupowana po producentach. */
export function GrinderSelect({
  grinders,
  value,
  onChange,
  id,
  allowIncomplete = false,
}: {
  grinders: Grinder[]
  value: string
  onChange: (id: string) => void
  id?: string
  allowIncomplete?: boolean
}) {
  const groups = new Map<string, Grinder[]>()
  for (const g of grinders) groups.set(g.brand, [...(groups.get(g.brand) ?? []), g])
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— wybierz młynek —</option>
      {[...groups].map(([brand, list]) => (
        <optgroup key={brand} label={brand}>
          {list.map((g) => {
            const ok = canConvert(g)
            return (
              <option key={g.id} value={g.id} disabled={!ok && !allowIncomplete}>
                {g.brand} {g.model} {ok ? `· ${g.confidence}` : "· brak danych"}
              </option>
            )
          })}
        </optgroup>
      ))}
    </select>
  )
}

const iconProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', viewBox: '0 0 24 24', 'aria-hidden': true } as const

export const Icon = {
  convert: () => (
    <svg {...iconProps}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>
  ),
  list: () => (
    <svg {...iconProps}><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
  ),
  plus: () => (
    <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>
  ),
  swap: () => (
    <svg {...iconProps} width="20" height="20"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>
  ),
  star: ({ filled }: { filled?: boolean }) => (
    <svg {...iconProps} width="20" height="20" fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
    </svg>
  ),
}
