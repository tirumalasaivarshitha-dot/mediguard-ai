import { useCallback, useEffect, useState } from 'react'

type State<T> = { data: T | null; loading: boolean; error: string | null }

export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })
  const clear = useCallback(() => {
    setState((s) => ({ ...s, data: null, loading: true, error: null }))
  }, [])

  const reload = useCallback(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Unable to load data.' })
      })
    return () => {
      cancelled = true
    }
  }, deps)

  useEffect(() => reload(), [reload])

  return { ...state, reload, clear }
}
