import { describe, expect, it } from 'vitest'
import grinders from '../../public/grinders.json'
import { canConvert, convert, missingData } from './convert'
import { formatSetting, parseSetting, ParseError } from './scales'
import type { Grinder } from './types'

const all = grinders as Grinder[]
const byId = (id: string) => {
  const g = all.find((x) => x.id === id)
  if (!g) throw new Error(`brak ${id}`)
  return g
}

describe('dane', () => {
  it('wszystkie młynki mają unikalne id', () => {
    expect(new Set(all.map((g) => g.id)).size).toBe(all.length)
  })
  it('27 młynków ma komplet danych', () => {
    expect(all.filter(canConvert).length).toBe(27)
  })
  it('Comandante bez liczby pozycji jest oznaczony jako niekompletny', () => {
    expect(missingData(byId('comandante-c40-mk4'))).toContain('liczba pozycji skali')
  })
})

describe('parsery skal', () => {
  it('1Zpresso obrót.numer.kreska', () => {
    const g = byId('1zpresso-j-ultra')
    expect(parseSetting(g, '1.3.2')).toBe(132)
    expect(parseSetting(g, '132')).toBe(132)
    expect(formatSetting(g, 132)).toBe('1.3.2')
    expect(() => parseSetting(g, '1.3.12')).toThrow(ParseError)
  })
  it('KINGrinder obroty.kliki', () => {
    const g = byId('kingrinder-k6')
    expect(parseSetting(g, '2.42')).toBe(162)
    expect(parseSetting(g, '2.05')).toBe(125)
    expect(formatSetting(g, 125)).toBe('2.05')
    expect(() => parseSetting(g, '4.10')).toThrow(ParseError)
  })
  it('Baratza makro + mikro', () => {
    const g = byId('baratza-sette-270')
    expect(parseSetting(g, '1A')).toBe(0)
    expect(parseSetting(g, '5e')).toBe(4 * 9 + 4)
    expect(formatSetting(g, 269)).toBe('30I')
    expect(() => parseSetting(g, '5J')).toThrow(ParseError)
  })
  it('Fellow numer + kreska', () => {
    const g = byId('fellow-ode-gen-2')
    expect(parseSetting(g, '1')).toBe(0)
    expect(parseSetting(g, '3.1')).toBe(7)
    expect(formatSetting(g, 30)).toBe('11')
  })
  it('pokrętło z półkrokami i przecinkiem', () => {
    const g = byId('oxo-brew-conical-burr')
    expect(parseSetting(g, '7,5')).toBe(13)
    expect(() => parseSetting(g, '7.3')).toThrow(ParseError)
  })
  it('odwrócona numeracja Wilfa', () => {
    const g = byId('wilfa-svart-aroma')
    expect(parseSetting(g, '18')).toBe(0)
    expect(parseSetting(g, '1')).toBe(17)
  })
  it('skala bezstopniowa EK43', () => {
    const g = byId('mahlkonig-ek43')
    expect(parseSetting(g, '6')).toBeCloseTo(0.5)
    expect(() => parseSetting(g, '12')).toThrow(ParseError)
  })
  it('wartość poza skalą', () => {
    expect(() => parseSetting(byId('baratza-encore'), '41')).toThrow(/Poza skalą/)
  })
})

describe('przeliczanie', () => {
  it('przeliczenie na ten sam młynek zwraca ten sam nastaw', () => {
    for (const g of all.filter(canConvert)) {
      if (g.scale.type === 'continuous') continue
      const mid = Math.floor((g.positions! - 1) / 2)
      const label = formatSetting(g, mid)
      expect(convert(g, label, g).label, g.id).toBe(label)
    }
  })
  it('K6 2.30 → Encore: wynik zgodny z ręcznym wyliczeniem z arkusza', () => {
    // K6: 150 / 239 × 1350 ≈ 847 µm; Encore: (847 − 250) / 950 × 40 ≈ 25
    const r = convert(byId('kingrinder-k6'), '2.30', byId('baratza-encore'))
    expect(r.microns).toBe(847)
    expect(r.label).toBe('25')
    expect(r.finer).toBe('24')
    expect(r.coarser).toBe('26')
    expect(r.confidence).toBe('A')
  })
  it('pewność wyniku = słabsza z obu', () => {
    expect(convert(byId('kingrinder-k6'), '1.00', byId('mahlkonig-ek43')).confidence).toBe('C')
  })
  it('przycina do zakresu docelowego młynka', () => {
    const r = convert(byId('1zpresso-j-ultra'), '0.1.0', byId('baratza-encore'))
    expect(r.clamped).toBe('finest')
    expect(r.label).toBe('0')
  })
})
