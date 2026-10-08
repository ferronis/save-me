export type View = 'next' | 'snoozed' | 'done' | 'dismissed'
export type Status = 'inbox' | 'done' | 'dismissed' | 'snoozed'

export type Save = {
  id: number
  platform: string
  permalink: string | null
  author_handle: string | null
  author_name: string | null
  text: string | null
  posted_at: string | null
  categories: string[]
  summary: string | null
  suggested_action: string | null
  priority: number | null
  deadline_on: string | null
  status: Status
  snoozed_until: string | null
  media_count: number
  thumbnail_url: string | null
  media_aspect: number | null
  media_type: 'image' | 'video' | 'link' | null
}

export type Category = { name: string; count: number }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed with ${response.status}`)
  return response.json() as Promise<T>
}

export function fetchSaves(view: View, category: string | null, query = '', offset = 0) {
  const params = new URLSearchParams({ view, offset: String(offset) })
  if (category) params.set('category', category)
  if (query) params.set('q', query)
  return request<{ total: number; items: Save[] }>(`/api/v1/saves?${params}`)
}

export function fetchCategories() {
  return request<Category[]>('/api/v1/categories')
}

export function updateSave(id: number, status: Status, snoozedUntil?: Date) {
  return request<Save>(`/api/v1/saves/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, snoozed_until: snoozedUntil?.toISOString() }),
  })
}
