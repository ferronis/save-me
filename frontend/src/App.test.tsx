import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'
import type { Save } from './api'

const save = (id: number, overrides: Partial<Save> = {}): Save => ({
  id,
  platform: 'threads',
  permalink: `https://www.threads.com/@a/post/${id}`,
  author_handle: 'a',
  author_name: null,
  text: `full text ${id}`,
  posted_at: '2026-10-01T12:00:00Z',
  categories: ['AI & Coding', 'Design'],
  summary: `Summary ${id}`,
  suggested_action: `Try thing ${id}`,
  priority: 60,
  deadline_on: null,
  status: 'inbox',
  snoozed_until: null,
  media_count: 0,
  thumbnail_url: null,
  media_aspect: null,
  media_type: null,
  ...overrides,
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = url.startsWith('/api/v1/categories')
      ? [{ name: 'AI & Coding', count: 2 }, { name: 'Design', count: 2 }]
      : init?.method === 'PATCH'
        ? save(1, { status: 'done' })
        : { total: 2, items: [save(1), save(2)] }
    return new Response(JSON.stringify(body), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => vi.unstubAllGlobals())

test('shows the do-next queue with summaries and actions', async () => {
  render(<App />)
  expect(await screen.findByText('Summary 1')).toBeInTheDocument()
  expect(screen.getByText('Try thing 2')).toBeInTheDocument()
  expect(screen.getByText('2 saves')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/saves?view=next&offset=0', expect.anything())
})

test('marking a save done removes it and patches the server', async () => {
  render(<App />)
  const card = (await screen.findByText('Summary 1')).closest('article')!
  await userEvent.click(within(card).getByRole('button', { name: /done/i }))

  expect(screen.queryByText('Summary 1')).not.toBeInTheDocument()
  expect(screen.getByText('1 save')).toBeInTheDocument()
  const [url, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')!
  expect(url).toBe('/api/v1/saves/1')
  expect(JSON.parse(init.body)).toEqual({ status: 'done' })
})

test('snoozing sends a future time', async () => {
  render(<App />)
  const card = (await screen.findByText('Summary 1')).closest('article')!
  await userEvent.click(within(card).getByRole('button', { name: /snooze/i }))
  await userEvent.click(within(card).getByRole('button', { name: 'Next week' }))

  const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')!
  const body = JSON.parse(init.body)
  expect(body.status).toBe('snoozed')
  expect(new Date(body.snoozed_until).getTime()).toBeGreaterThan(Date.now())
})

test('clicking a category chip filters the list', async () => {
  render(<App />)
  const card = (await screen.findByText('Summary 1')).closest('article')!
  await userEvent.click(within(card).getByRole('button', { name: 'Design' }))

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/saves?view=next&offset=0&category=Design', expect.anything()),
  )
})

test('puts a failed update back and shows the error', async () => {
  render(<App />)
  const card = (await screen.findByText('Summary 1')).closest('article')!
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }))
  await userEvent.click(within(card).getByRole('button', { name: /dismiss/i }))

  expect(await screen.findByText(/failed with 500/)).toBeInTheDocument()
  expect(screen.getByText('Summary 1')).toBeInTheDocument()
})

test('searching sends the query once typing pauses', async () => {
  render(<App />)
  await screen.findByText('Summary 1')
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search saves' }), 'glaze')

  await waitFor(() =>
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/saves?view=next&offset=0&q=glaze', expect.anything()),
  )
})

test('shows the platform as its logo', async () => {
  render(<App />)
  await screen.findByText('Summary 1')
  expect(screen.getAllByRole('img', { name: 'Threads' })).toHaveLength(2)
})

test('shows an error when loading more fails', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.startsWith('/api/v1/categories')) return new Response('[]', { status: 200 })
    if (url.includes('offset=2')) return new Response('{}', { status: 500 })
    return new Response(JSON.stringify({ total: 5, items: [save(1), save(2)] }), { status: 200 })
  })
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))

  expect(await screen.findByText(/failed with 500/)).toBeInTheDocument()
  expect(screen.getByText('Summary 1')).toBeInTheDocument()

  // A successful retry clears the error.
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ total: 3, items: [save(3)] }), { status: 200 }))
  await userEvent.click(screen.getByRole('button', { name: 'Load more' }))
  await waitFor(() => expect(screen.queryByText(/failed with 500/)).not.toBeInTheDocument())
  expect(screen.getByText('Summary 3')).toBeInTheDocument()
})
