import { useCallback, useEffect, useState } from 'react'
import { Icon } from './components/ui'
import { loadGrinders, type DataSource } from './lib/data'
import { KEYS, read, write } from './lib/storage'
import type { Grinder } from './lib/types'
import Convert from './pages/Convert'
import GrinderDetail from './pages/GrinderDetail'
import Grinders from './pages/Grinders'
import Moderation from './pages/Moderation'
import Submit from './pages/Submit'

/** Routing na hashu – działa na GitHub Pages bez konfiguracji serwera. */
function useHashRoute() {
  const get = () => window.location.hash.replace(/^#/, '') || '/'
  const [route, setRoute] = useState(get)
  useEffect(() => {
    const on = () => {
      setRoute(get())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

const SOURCE_TEXT: Record<DataSource, string> = {
  online: 'Dane aktualne',
  cache: 'Offline',
  bundled: 'Baza wbudowana',
}

export interface AppState {
  grinders: Grinder[]
  myGrinder: string
  setMyGrinder: (id: string) => void
  reload: () => void
}

export default function App() {
  const route = useHashRoute()
  const [grinders, setGrinders] = useState<Grinder[] | null>(null)
  const [source, setSource] = useState<DataSource>('bundled')
  const [error, setError] = useState<string | null>(null)
  const [myGrinder, setMy] = useState<string>(() => read(KEYS.myGrinder, ''))

  const reload = useCallback(() => {
    loadGrinders()
      .then((r) => {
        setGrinders(r.grinders)
        setSource(r.source)
      })
      .catch(() => setError('Nie udało się wczytać bazy młynków.'))
  }, [])
  useEffect(reload, [reload])

  const setMyGrinder = (id: string) => {
    setMy(id)
    write(KEYS.myGrinder, id || null)
  }

  const [path, query = ''] = route.split('?')
  const params = new URLSearchParams(query)
  const tab = path.startsWith('/mlyn') ? 'list' : path.startsWith('/zglos') ? 'submit' : path === '/' ? 'convert' : ''

  let page: React.ReactNode
  if (error) page = <p className="notice bad">{error}</p>
  else if (!grinders) page = <p className="muted">Wczytywanie bazy młynków…</p>
  else {
    const state: AppState = { grinders, myGrinder, setMyGrinder, reload }
    if (path.startsWith('/mlynek/')) page = <GrinderDetail {...state} id={decodeURIComponent(path.slice(8))} />
    else if (path === '/mlynki') page = <Grinders {...state} />
    else if (path === '/zglos') page = <Submit {...state} grinderId={params.get('id')} />
    else if (path === '/mod') page = <Moderation {...state} />
    else page = <Convert {...state} />
  }

  return (
    <>
      <header className="topbar">
        <a className="brand" href="#/">
          <img src="./icon.svg" alt="" />
          <strong>Przelicznik młynków</strong>
        </a>
        <span className="source" title="Źródło danych">{grinders ? SOURCE_TEXT[source] : ''}</span>
      </header>
      <main>{page}</main>
      <footer className="foot">
        <p>Bezpłatne, bez reklam i bez kont. Dane współtworzy społeczność.</p>
      </footer>
      <nav className="tabs" aria-label="Główna nawigacja">
        <a href="#/" aria-current={tab === 'convert' ? 'page' : undefined}><Icon.convert />Przelicz</a>
        <a href="#/mlynki" aria-current={tab === 'list' ? 'page' : undefined}><Icon.list />Młynki</a>
        <a href="#/zglos" aria-current={tab === 'submit' ? 'page' : undefined}><Icon.plus />Uzupełnij dane</a>
      </nav>
    </>
  )
}
