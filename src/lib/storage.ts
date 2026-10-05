// localStorage bywa niedostępny (tryb prywatny, zablokowane dane) – każdy dostęp w try/catch.
export function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v == null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function write(key: string, value: unknown) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignorujemy – to tylko wygoda */
  }
}

export const KEYS = {
  myGrinder: 'mlynki.my',
  lastFrom: 'mlynki.from',
  cache: 'mlynki.grinders',
} as const
