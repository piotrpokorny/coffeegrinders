import { useEffect, useMemo, useState } from 'react'
import type { AppState } from '../App'
import { CONFIDENCE_TEXT, ConfidenceBadge, GrinderSelect, Icon, grinderName } from '../components/ui'
import { convert, type ConversionResult } from '../lib/convert'
import { ParseError, settingHint } from '../lib/scales'
import { KEYS, read, write } from '../lib/storage'

export default function Convert({ grinders, myGrinder, setMyGrinder }: AppState) {
  const [fromId, setFromId] = useState<string>(() => read(KEYS.lastFrom, ''))
  const [toId, setToId] = useState<string>(myGrinder)
  const [setting, setSetting] = useState('')

  useEffect(() => write(KEYS.lastFrom, fromId || null), [fromId])
  useEffect(() => { if (!toId && myGrinder) setToId(myGrinder) }, [myGrinder, toId])

  const from = grinders.find((g) => g.id === fromId)
  const to = grinders.find((g) => g.id === toId)

  const outcome = useMemo((): { result?: ConversionResult; error?: string } => {
    if (!from || !to || !setting.trim()) return {}
    try {
      return { result: convert(from, setting, to) }
    } catch (e) {
      return { error: e instanceof ParseError ? e.message : 'Nie udało się przeliczyć.' }
    }
  }, [from, to, setting])

  const swap = () => {
    setFromId(toId)
    setToId(fromId)
    if (outcome.result) setSetting(outcome.result.label)
  }

  const hint = from ? settingHint(from) : null
  const isMine = toId !== '' && toId === myGrinder
  const r = outcome.result

  return (
    <div className="stack">
      <div>
        <h1>Przelicz nastaw</h1>
        <p className="muted">Masz przepis na inny młynek? Wpisz jego nastaw, a podpowiemy odpowiednik na Twoim.</p>
      </div>

      {!myGrinder && (
        <p className="notice info">
          Wskaż swój młynek w polu <strong>„Na młynek”</strong> i kliknij gwiazdkę – zapamiętamy go na tym urządzeniu.
        </p>
      )}

      <section className="card converter" aria-label="Przelicznik">
        <label className="field" htmlFor="from">
          Z młynka (z przepisu)
          <GrinderSelect id="from" grinders={grinders} value={fromId} onChange={setFromId} />
        </label>

        <label className="field" htmlFor="setting">
          Nastaw
          <input
            id="setting"
            className="big"
            inputMode="text"
            autoComplete="off"
            placeholder={hint?.placeholder ?? 'najpierw wybierz młynek'}
            disabled={!from}
            value={setting}
            aria-invalid={outcome.error ? true : undefined}
            aria-describedby="setting-help"
            onChange={(e) => setSetting(e.target.value)}
          />
          <span id="setting-help" className="hint">{outcome.error ?? hint?.help}</span>
        </label>

        <button type="button" className="swap icon" onClick={swap} disabled={!fromId || !toId} aria-label="Zamień kierunek">
          <Icon.swap />
        </button>

        <label className="field" htmlFor="to">
          Na młynek {isMine && <span className="hint">(Twój młynek)</span>}
          <div className="grinder-select">
            <GrinderSelect id="to" grinders={grinders} value={toId} onChange={setToId} />
            <button
              type="button"
              className="icon star"
              disabled={!toId}
              aria-pressed={isMine}
              title={isMine ? 'To Twój młynek' : 'Ustaw jako mój młynek'}
              aria-label={isMine ? 'To Twój młynek' : 'Ustaw jako mój młynek'}
              onClick={() => setMyGrinder(isMine ? '' : toId)}
            >
              <Icon.star filled={isMine} />
            </button>
          </div>
        </label>
      </section>

      {r && from && to && (
        <section className="result" aria-live="polite">
          <div className="muted small">Ustaw na {grinderName(to)}</div>
          <div className="value">{r.label}</div>
          {r.description && <div className="small muted">{r.description}</div>}
          <div className="neighbours">
            <span className="chip">≈ {r.microns} µm</span>
            <span className="chip">pewność <ConfidenceBadge value={r.confidence} /></span>
          </div>
          {(r.finer || r.coarser) && (
            <p className="small" style={{ marginBottom: 0 }}>
              Testuj też: {r.finer && <><strong>{r.finer}</strong> (drobniej)</>}
              {r.finer && r.coarser && ' · '}
              {r.coarser && <><strong>{r.coarser}</strong> (grubiej)</>}
            </p>
          )}
        </section>
      )}

      {r?.clamped && (
        <p className="notice warn">
          {r.clamped === 'finest'
            ? 'Twój młynek nie mieli tak drobno – pokazujemy najdrobniejszy dostępny nastaw.'
            : 'Twój młynek nie mieli tak grubo – pokazujemy najgrubszy dostępny nastaw.'}
        </p>
      )}
      {r && r.confidence !== 'A' && <p className="notice warn">{CONFIDENCE_TEXT[r.confidence]}</p>}

      <details className="card">
        <summary>Jak liczymy?</summary>
        <div className="small muted stack" style={{ gap: 8, marginTop: 10 }}>
          <p style={{ margin: 0 }}>
            Każdy młynek ma zakres rozmiaru cząstek (od najdrobniejszego do najgrubszego nastawu) i liczbę pozycji na skali.
            Nastaw z przepisu zamieniamy na szacowany rozmiar w µm, a potem szukamy najbliższej pozycji na Twoim młynku.
          </p>
          <p style={{ margin: 0 }}>
            To przybliżenie: żarna o innej geometrii dają inny rozkład cząstek przy tym samym średnim rozmiarze,
            a zakresy zaczynające się od 0 µm to zwykle początek osi wykresu w źródle. Zawsze dopracuj nastaw smakiem.
          </p>
          <p style={{ margin: 0 }}>
            Młynki bez kompletu danych są na liście wyszarzone. <a href="#/zglos">Pomóż je uzupełnić</a>.
          </p>
        </div>
      </details>
    </div>
  )
}
