const dayMs = 24 * 60 * 60 * 1000

// Deadlines are calendar dates; parse them as local midnight, not UTC.
export function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function daysUntil(value: string, today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((parseDate(value).getTime() - start.getTime()) / dayMs)
}

export function shortDate(date: Date) {
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
}

export function snoozeOptions(now = new Date()) {
  const at = (days: number) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 8)
    return date
  }
  return [
    { label: 'Tomorrow', until: at(1) },
    { label: 'Next week', until: at(7) },
    { label: 'Next month', until: at(30) },
  ]
}
