import { useCallback, useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { fetchCategories, fetchSaves, updateSave, type Category, type Save, type Status, type View } from './api'
import { SaveCard } from './components/SaveCard'
import { useColumnCount } from './useColumnCount'

const VIEWS: { id: View; label: string }[] = [
  { id: 'next', label: 'Do next' },
  { id: 'snoozed', label: 'Snoozed' },
  { id: 'done', label: 'Done' },
  { id: 'dismissed', label: 'Dismissed' },
]

const COLUMN_WIDTH = 360
const GAP = 20
const SEARCH_DELAY_MS = 250

export default function App() {
  const [view, setView] = useState<View>('next')
  const [category, setCategory] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  // Results remember which selection they belong to, so "loading" is simply
  // "the results on screen are for a different selection".
  const key = `${view}|${category ?? ''}|${query}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [saves, setSaves] = useState<Save[]>([])
  const [total, setTotal] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [grid, setGrid] = useState<HTMLElement | null>(null)
  const columnCount = useColumnCount(grid, COLUMN_WIDTH, GAP)
  const loading = loadedKey !== key
  // Bumped on every selection change, so a Load more page from an earlier
  // visit to this same selection is still recognised as stale.
  const generation = useRef(0)
  useEffect(() => {
    generation.current += 1
  }, [key])

  const loadCategories = useCallback(() => {
    fetchCategories().then(setCategories).catch(() => {})
  }, [])

  // Search as you type, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    const selection = `${view}|${category ?? ''}|${query}`
    fetchSaves(view, category, query)
      .then((page) => {
        if (cancelled) return
        setSaves(page.items)
        setTotal(page.total)
        setError(null)
      })
      .catch((e: Error) => {
        if (cancelled) return
        setSaves([])
        setTotal(0)
        setError(e.message)
      })
      .finally(() => !cancelled && setLoadedKey(selection))
    return () => {
      cancelled = true
    }
  }, [view, category, query])

  useEffect(loadCategories, [loadCategories])

  async function loadMore() {
    const started = generation.current
    try {
      const page = await fetchSaves(view, category, query, saves.length)
      // Drop the page if the view, category, or search changed meanwhile.
      if (started !== generation.current) return
      setSaves((current) => [...current, ...page.items])
      setTotal(page.total)
      setError(null)
    } catch (e) {
      if (started === generation.current) setError((e as Error).message)
    }
  }

  async function handleUpdate(save: Save, status: Status, snoozedUntil?: Date) {
    // Every action moves the save out of the current view, so drop it right away.
    setSaves((current) => current.filter((s) => s.id !== save.id))
    setTotal((current) => current - 1)
    try {
      await updateSave(save.id, status, snoozedUntil)
      loadCategories()
    } catch (e) {
      setSaves((current) => [save, ...current])
      setTotal((current) => current + 1)
      setError((e as Error).message)
    }
  }

  function pickCategory(name: string | null) {
    setCategory(name)
    window.scrollTo({ top: 0 })
  }

  // Deal saves across columns left to right, so the ranking reads across the
  // top row instead of down the first column.
  const columns: Save[][] = Array.from({ length: columnCount }, () => [])
  saves.forEach((save, index) => columns[index % columnCount].push(save))

  const countLabel = `${total} ${total === 1 ? 'save' : 'saves'}${category ? ` in ${category}` : ''}${query ? ` matching “${query}”` : ''}`

  return (
    <>
      <div className="backdrop" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <div className="flex flex-col gap-5 p-4 md:flex-row md:gap-6 md:p-6">
        <aside className="slab p-4 md:sticky md:top-6 md:h-[calc(100vh-3rem)] md:w-60 md:shrink-0 md:overflow-y-auto">
          <h1 className="px-2 text-lg font-semibold tracking-tight">Save Me</h1>
          <nav aria-label="Views" className="mt-4 flex gap-1.5 overflow-x-auto md:flex-col">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                aria-current={view === v.id ? 'page' : undefined}
                onClick={() => setView(v.id)}
                className={`${view === v.id ? 'pill' : 'quiet'} px-3.5 py-1.5 text-left text-sm whitespace-nowrap`}
              >
                {v.label}
              </button>
            ))}
          </nav>
          <h2 className="text-soft mt-6 hidden px-2 text-xs font-semibold tracking-wide uppercase md:block">Categories</h2>
          <nav aria-label="Categories" className="mt-2 flex gap-1 overflow-x-auto pb-1 md:flex-col md:pb-0">
            <button
              type="button"
              aria-current={category === null ? 'true' : undefined}
              onClick={() => pickCategory(null)}
              className={`${category === null ? 'pill' : 'quiet'} flex justify-between gap-3 px-3.5 py-1 text-left text-sm whitespace-nowrap`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c.name}
                type="button"
                aria-current={category === c.name ? 'true' : undefined}
                onClick={() => pickCategory(c.name)}
                className={`${category === c.name ? 'pill' : 'quiet'} flex justify-between gap-3 px-3.5 py-1 text-left text-sm whitespace-nowrap`}
              >
                <span>{c.name}</span>
                <span className="tabular-nums opacity-60">{c.count}</span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {/* Pinned while the cards scroll underneath; the count lives inside so
              nothing loose floats over the cards. */}
          <div className="sticky top-4 z-20 md:top-6">
            <label className="slab search flex h-12 w-full max-w-2xl items-center gap-2.5 px-5">
              <Search className="text-soft size-4 shrink-0" aria-hidden />
              <input
                type="search"
                aria-label="Search saves"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search saves…"
                className="min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-[var(--ink-soft)]"
              />
              <span className="text-soft shrink-0 text-sm" aria-live="polite">
                {loading ? 'Loading…' : countLabel}
              </span>
            </label>
          </div>

          {error && <p className="slab mt-4 px-5 py-3 text-sm font-semibold">{error}</p>}

          {!loading && saves.length === 0 && !error && (
            <p className="text-soft mt-16 text-center">
              {query
                ? 'No saves match that search.'
                : view === 'next'
                  ? 'Nothing waiting. Sync from the extension to pull in new saves.'
                  : 'Nothing here yet.'}
            </p>
          )}

          <div ref={setGrid} className="mt-5 flex items-start" style={{ gap: GAP }}>
            {columns.map((column, index) => (
              <div key={index} className="flex min-w-0 flex-1 flex-col" style={{ gap: GAP }}>
                {column.map((save) => (
                  <SaveCard key={save.id} save={save} actionable={view === 'next'} onUpdate={handleUpdate} onCategory={pickCategory} />
                ))}
              </div>
            ))}
          </div>

          {saves.length < total && !loading && (
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={loadMore} className="pill px-6 py-2.5 text-sm font-medium">
                Load more
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  )
}
