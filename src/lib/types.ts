export type Confidence = 'A' | 'B' | 'C'

export type Scale =
  | { type: 'clicks'; start: number }
  | { type: 'dial'; start: number; step: number; reversed?: boolean }
  | { type: 'rot_num_tick'; perRotation: number; ticksPerNumber: number }
  | { type: 'rot_clicks'; perRotation: number }
  | { type: 'num_sub'; start: number; sub: number }
  | { type: 'macro_micro'; macroStart: number; micro: number }
  | { type: 'continuous'; from: number; to: number; decimals: number }
  | { type: 'unknown' }

export type ScaleType = Scale['type']

export interface Grinder {
  id: string
  brand: string
  model: string
  kind: 'manual' | 'electric'
  adjustment: string | null
  /** Zakres rozmiaru cząstek (µm) od najdrobniejszego do najgrubszego nastawu. */
  range_min: number | null
  range_max: number | null
  range_source: string | null
  /** Liczba pozycji skali (dla skal stopniowych). */
  positions: number | null
  clicks_per_rotation: number | null
  /** Deklarowane przesunięcie żaren na klik – tylko informacyjnie, nie do przeliczeń. */
  um_per_click: number | null
  scale: Scale
  scale_note: string | null
  confidence: Confidence
  notes: string | null
  updated_at: string
}
