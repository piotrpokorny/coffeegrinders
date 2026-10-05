import { formatSetting, describeSetting, isContinuous, parseSetting } from './scales'
import type { Confidence, Grinder } from './types'

export interface ConversionResult {
  microns: number
  label: string
  description: string | null
  /** Sąsiednie nastawy (drobniej / grubiej) – do testów w filiżance. */
  finer: string | null
  coarser: string | null
  /** Ustawiono skrajny nastaw, bo docelowy młynek nie sięga tak drobno/grubo. */
  clamped: 'finest' | 'coarsest' | null
  confidence: Confidence
}

/** Czy dla młynka mamy dość danych, żeby go przeliczać. */
export function missingData(g: Grinder): string[] {
  const missing: string[] = []
  if (g.range_min == null || g.range_max == null || g.range_max <= g.range_min) missing.push('zakres µm')
  if (g.scale.type === 'unknown') missing.push('typ skali')
  else if (!isContinuous(g.scale) && !(g.positions && g.positions >= 2)) missing.push('liczba pozycji skali')
  return missing
}

export const canConvert = (g: Grinder) => missingData(g).length === 0

export function worstConfidence(a: Confidence, b: Confidence): Confidence {
  return a > b ? a : b
}

/** Pozycja (indeks lub ułamek) → szacowany rozmiar cząstek w µm. */
export function positionToMicrons(g: Grinder, pos: number): number {
  const min = g.range_min!, max = g.range_max!
  const t = isContinuous(g.scale) ? pos : pos / (g.positions! - 1)
  return min + t * (max - min)
}

/** Rozmiar w µm → najbliższa pozycja na skali młynka (z informacją o przycięciu). */
export function micronsToPosition(g: Grinder, microns: number): { pos: number; clamped: ConversionResult['clamped'] } {
  const min = g.range_min!, max = g.range_max!
  let t = (microns - min) / (max - min)
  let clamped: ConversionResult['clamped'] = null
  if (t < 0) { t = 0; clamped = 'finest' }
  if (t > 1) { t = 1; clamped = 'coarsest' }
  if (isContinuous(g.scale)) return { pos: t, clamped }
  return { pos: Math.round(t * (g.positions! - 1)), clamped }
}

export function convert(from: Grinder, setting: string, to: Grinder): ConversionResult {
  const pos = parseSetting(from, setting)
  const microns = positionToMicrons(from, pos)
  const target = micronsToPosition(to, microns)
  const stepped = !isContinuous(to.scale)
  const last = (to.positions ?? 1) - 1
  return {
    microns: Math.round(microns),
    label: formatSetting(to, target.pos),
    description: stepped ? describeSetting(to, target.pos) : null,
    finer: stepped && target.pos > 0 ? formatSetting(to, target.pos - 1) : null,
    coarser: stepped && target.pos < last ? formatSetting(to, target.pos + 1) : null,
    clamped: target.clamped,
    confidence: worstConfidence(from.confidence, to.confidence),
  }
}
