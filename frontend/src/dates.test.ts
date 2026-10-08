import { expect, test } from 'vitest'
import { daysUntil, snoozeOptions } from './dates'

test('counts calendar days to a deadline', () => {
  const today = new Date(2026, 9, 7, 23, 30)
  expect(daysUntil('2026-10-07', today)).toBe(0)
  expect(daysUntil('2026-10-08', today)).toBe(1)
  expect(daysUntil('2026-10-01', today)).toBe(-6)
})

test('snoozes until 8am on the chosen day', () => {
  const [tomorrow, week] = snoozeOptions(new Date(2026, 9, 7, 15))
  expect(tomorrow.until).toEqual(new Date(2026, 9, 8, 8))
  expect(week.until).toEqual(new Date(2026, 9, 14, 8))
})
