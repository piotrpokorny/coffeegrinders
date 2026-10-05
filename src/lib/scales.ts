import type { Grinder, Scale } from './types'

/**
 * Pozycja na skali młynka: indeks 0 = najdrobniejszy nastaw.
 * Dla skal stopniowych to liczba całkowita 0…positions-1,
 * dla skal bezstopniowych – ułamek 0…1 całego zakresu.
 */
export class ParseError extends Error {}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function toNumber(s: string): number {
  const n = Number(s.trim().replace(',', '.'))
  if (!Number.isFinite(n)) throw new ParseError('To nie jest liczba.')
  return n
}

function toInt(s: string, what: string): number {
  const n = toNumber(s)
  if (!Number.isInteger(n) || n < 0) throw new ParseError(`${what}: podaj liczbę całkowitą ≥ 0.`)
  return n
}

function isWhole(x: number) {
  return Math.abs(x - Math.round(x)) < 1e-6
}

export function isContinuous(scale: Scale) {
  return scale.type === 'continuous'
}

/** Zamienia wpisany nastaw na indeks pozycji (stopniowe) lub ułamek zakresu (bezstopniowe). */
export function parseSetting(g: Grinder, raw: string): number {
  const input = raw.trim()
  if (!input) throw new ParseError('Wpisz nastaw.')
  const s = g.scale
  const n = g.positions ?? 0
  let idx: number

  switch (s.type) {
    case 'clicks':
      idx = toInt(input, 'Kliki') - s.start
      break
    case 'dial': {
      const k = (toNumber(input) - s.start) / s.step
      if (!isWhole(k)) throw new ParseError(`Dozwolone wartości co ${String(s.step).replace('.', ',')}.`)
      idx = Math.round(k)
      if (s.reversed) idx = n - 1 - idx
      break
    }
    case 'rot_num_tick': {
      const parts = input.split(/[.,:\s]+/)
      if (parts.length === 1) {
        idx = toInt(parts[0], 'Kliki')
        break
      }
      const [r, num, t = '0'] = parts
      const numbers = s.perRotation / s.ticksPerNumber
      const R = toInt(r, 'Obrót'), N = toInt(num, 'Numer'), T = toInt(t, 'Kreska')
      if (N >= numbers) throw new ParseError(`Numer musi być od 0 do ${numbers - 1}.`)
      if (T >= s.ticksPerNumber) throw new ParseError(`Kreska musi być od 0 do ${s.ticksPerNumber - 1}.`)
      idx = R * s.perRotation + N * s.ticksPerNumber + T
      break
    }
    case 'rot_clicks': {
      const parts = input.split(/[.,:\s]+/)
      if (parts.length === 1) {
        idx = toInt(parts[0], 'Kliki')
        break
      }
      const R = toInt(parts[0], 'Obrót'), C = toInt(parts[1], 'Klik')
      if (C >= s.perRotation) throw new ParseError(`Klik w obrocie musi być od 0 do ${s.perRotation - 1}.`)
      idx = R * s.perRotation + C
      break
    }
    case 'num_sub': {
      const [a, b = '0'] = input.split(/[.,]/)
      const A = toInt(a, 'Numer'), B = toInt(b, 'Podpozycja')
      if (B >= s.sub) throw new ParseError(`Po kropce dozwolone 0–${s.sub - 1}.`)
      idx = (A - s.start) * s.sub + B
      break
    }
    case 'macro_micro': {
      const m = input.toUpperCase().match(/^(\d+)\s*([A-Z]?)$/)
      if (!m) throw new ParseError('Format: numer + litera, np. 5E.')
      const letter = m[2] ? LETTERS.indexOf(m[2]) : 0
      if (letter >= s.micro) throw new ParseError(`Litera musi być od A do ${LETTERS[s.micro - 1]}.`)
      idx = (Number(m[1]) - s.macroStart) * s.micro + letter
      break
    }
    case 'continuous': {
      const v = toNumber(input)
      if (v < s.from || v > s.to) throw new ParseError(`Skala od ${fmt(s.from)} do ${fmt(s.to)}.`)
      return (v - s.from) / (s.to - s.from)
    }
    default:
      throw new ParseError('Brak danych o skali tego młynka.')
  }

  if (idx < 0 || idx > n - 1) {
    throw new ParseError(`Poza skalą: dozwolone ${formatSetting(g, 0)} – ${formatSetting(g, n - 1)}.`)
  }
  return idx
}

function fmt(x: number, decimals = 2) {
  return String(Number(x.toFixed(decimals))).replace('.', ',')
}

/** Zamienia indeks pozycji (lub ułamek dla skal bezstopniowych) na etykietę skali. */
export function formatSetting(g: Grinder, pos: number): string {
  const s = g.scale
  const n = g.positions ?? 0
  switch (s.type) {
    case 'clicks':
      return String(pos + s.start)
    case 'dial': {
      const k = s.reversed ? n - 1 - pos : pos
      return fmt(s.start + k * s.step)
    }
    case 'rot_num_tick': {
      const r = Math.floor(pos / s.perRotation)
      const rem = pos % s.perRotation
      return `${r}.${Math.floor(rem / s.ticksPerNumber)}.${rem % s.ticksPerNumber}`
    }
    case 'rot_clicks': {
      const r = Math.floor(pos / s.perRotation)
      return `${r}.${String(pos % s.perRotation).padStart(2, '0')}`
    }
    case 'num_sub': {
      const a = s.start + Math.floor(pos / s.sub)
      const b = pos % s.sub
      return b ? `${a}.${b}` : String(a)
    }
    case 'macro_micro':
      return `${s.macroStart + Math.floor(pos / s.micro)}${LETTERS[pos % s.micro]}`
    case 'continuous':
      return fmt(s.from + pos * (s.to - s.from), s.decimals)
    default:
      return '–'
  }
}

/** Dodatkowe objaśnienie nastawu (np. łączna liczba klików). */
export function describeSetting(g: Grinder, pos: number): string | null {
  const s = g.scale
  switch (s.type) {
    case 'rot_num_tick':
      return `obrót ${Math.floor(pos / s.perRotation)}, numer ${Math.floor((pos % s.perRotation) / s.ticksPerNumber)}, kreska ${pos % s.ticksPerNumber} · łącznie ${pos} klików od zera`
    case 'rot_clicks':
      return `${Math.floor(pos / s.perRotation)} pełne obroty + ${pos % s.perRotation} klików · łącznie ${pos} klików od zera`
    case 'clicks':
      return `${pos + s.start} klików od zera`
    case 'dial':
      return s.reversed ? 'uwaga: numeracja odwrócona (niższy numer = grubiej)' : null
    default:
      return null
  }
}

/** Podpowiedź do pola wpisywania nastawu. */
export function settingHint(g: Grinder): { placeholder: string; help: string } {
  const s = g.scale
  const n = g.positions ?? 0
  const range = n ? `${formatSetting(g, 0)} – ${formatSetting(g, n - 1)}` : ''
  switch (s.type) {
    case 'clicks':
      return { placeholder: 'np. 18', help: `Liczba klików od zera (zamknięte żarna). Zakres: ${range}.` }
    case 'dial':
      return { placeholder: `np. ${formatSetting(g, Math.floor(n / 2))}`, help: `Numer na pokrętle. Zakres: ${range}.` }
    case 'rot_num_tick':
      return { placeholder: 'np. 1.3.2', help: `obrót.numer.kreska albo łączna liczba klików. Zakres: ${range}.` }
    case 'rot_clicks':
      return { placeholder: 'np. 2.42', help: `obroty.kliki (2.42 = 2 obroty + 42 kliki) albo łączna liczba klików. Zakres: ${range}.` }
    case 'num_sub':
      return { placeholder: 'np. 3.1', help: `Numer na tarczy i kreska pośrednia (np. 3.1). Zakres: ${range}.` }
    case 'macro_micro':
      return { placeholder: 'np. 5E', help: `Makro (cyfra) + mikro (litera). Zakres: ${range}.` }
    case 'continuous':
      return { placeholder: `np. ${fmt((s.from + s.to) / 2, 1)}`, help: `Skala bezstopniowa od ${fmt(s.from)} do ${fmt(s.to)} – podaj wartość z dokładnością do ${s.decimals ? '0,' + '0'.repeat(s.decimals - 1) + '1' : '1'}.` }
    default:
      return { placeholder: '', help: 'Brak danych o skali.' }
  }
}

export const SCALE_LABELS: Record<Scale['type'], string> = {
  clicks: 'Kliki od zera',
  dial: 'Numer na pokrętle',
  rot_num_tick: 'Obrót.numer.kreska (1Zpresso)',
  rot_clicks: 'Obroty.kliki (KINGrinder)',
  num_sub: 'Numer + kreska pośrednia (Fellow)',
  macro_micro: 'Makro + mikro litera (Baratza)',
  continuous: 'Bezstopniowa ze skalą',
  unknown: 'Nieznana',
}
