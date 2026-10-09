import { useState } from 'react'
import { ArrowRight, Check, Clock, ExternalLink, Images, Inbox, Play, X } from 'lucide-react'
import type { Save, Status } from '../api'
import { daysUntil, parseDate, shortDate, snoozeOptions } from '../dates'
import { PlatformIcon } from './PlatformIcon'

type Props = {
  save: Save
  // True in the do-next queue; elsewhere the only action is moving back to it.
  actionable: boolean
  onUpdate: (save: Save, status: Status, snoozedUntil?: Date) => void
  onCategory: (name: string) => void
}

// Only web links are rendered. The server already rejects other schemes;
// this keeps a javascript: URL from ever becoming a clickable link.
function safeHref(url: string | null) {
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

// Long posts collapse to a few lines, like Threads.
const CLAMP_CHARS = 280

function Deadline({ value }: { value: string }) {
  const days = daysUntil(value)
  const date = shortDate(parseDate(value))
  if (days < 0) return <span className="text-soft text-xs line-through">Due {date}</span>
  const label = days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due ${date}`
  return <span className={`pill px-2.5 py-0.5 text-xs ${days <= 7 ? 'font-semibold' : ''}`}>{label}</span>
}

// Portrait images are capped at 4:5 and wide ones at 1.91:1, the range
// Threads and Instagram display.
function aspectFor(save: Save) {
  return Math.min(Math.max(save.media_aspect ?? 1, 0.8), 1.91)
}

export function SaveCard({ save, actionable, onUpdate, onCategory }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const posted = save.posted_at ? shortDate(new Date(save.posted_at)) : null
  const handle = save.author_handle ?? save.platform
  const body = save.text?.trim() || null
  const long = (body?.length ?? 0) > CLAMP_CHARS

  return (
    <article className="slab p-5 sm:p-6">
      <header className="flex items-center gap-3">
        <div className="pill grid size-10 shrink-0 place-items-center">
          <PlatformIcon platform={save.platform} className="size-[18px]" />
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{handle}</p>
          {posted && <p className="text-soft mt-0.5 text-xs">{posted}</p>}
        </div>
        {save.priority !== null && (
          <span
            className={`pill px-2.5 py-0.5 text-xs tabular-nums ${save.priority >= 80 ? 'font-bold' : 'font-medium'}`}
            title="Priority"
          >
            {save.priority}
          </span>
        )}
      </header>

      {body && (
        <div className="mt-3 text-[15px] leading-relaxed">
          {/* overflow-wrap: anywhere lets long URLs break instead of running off the card. */}
          <p className={`whitespace-pre-line [overflow-wrap:anywhere] ${long && !expanded ? 'line-clamp-5' : ''}`}>{body}</p>
          {long && (
            <button type="button" className="text-soft mt-1 text-sm font-medium hover:underline" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {save.thumbnail_url && (
        <a
          href={safeHref(save.permalink)}
          target="_blank"
          rel="noreferrer"
          className="relative mt-4 block overflow-hidden rounded-2xl outline outline-1 -outline-offset-1 outline-black/10"
          style={{ aspectRatio: aspectFor(save) }}
          aria-label={`Open post by ${handle}`}
        >
          <img src={save.thumbnail_url} alt="" loading="lazy" className="size-full object-cover" />
          {save.media_type === 'video' && (
            <span className="absolute inset-0 grid place-items-center">
              <span className="grid size-14 place-items-center rounded-full bg-black/45 text-white backdrop-blur-md">
                <Play className="size-6 translate-x-0.5 fill-current" aria-hidden />
              </span>
            </span>
          )}
          {save.media_count > 1 && (
            <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-md">
              <Images className="size-3.5" aria-hidden />
              {save.media_count}
            </span>
          )}
        </a>
      )}

      {(save.summary || save.suggested_action) && (
        <div className="etched mt-4 pt-4">
          {save.summary && <p className="text-soft text-sm">{save.summary}</p>}
          {save.suggested_action && (
            <p className="mt-2 flex items-start gap-2 text-[15px] font-medium">
              <ArrowRight className="mt-1 size-4 shrink-0" aria-hidden />
              {save.suggested_action}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {save.categories.map((name) => (
          <button key={name} type="button" onClick={() => onCategory(name)} className="pill px-3 py-1 text-xs">
            {name}
          </button>
        ))}
        {save.deadline_on && <Deadline value={save.deadline_on} />}
        {save.status === 'snoozed' && save.snoozed_until && (
          <span className="text-soft text-xs">Snoozed until {shortDate(new Date(save.snoozed_until))}</span>
        )}
      </div>

      <div className="etched mt-4 flex flex-wrap items-center gap-1 pt-3 text-sm">
        {actionable ? (
          <>
            <button type="button" className="quiet inline-flex items-center gap-1.5 px-3 py-1.5" onClick={() => onUpdate(save, 'done')}>
              <Check className="size-4" aria-hidden /> Done
            </button>
            <div className="relative">
              <button
                type="button"
                className="quiet inline-flex items-center gap-1.5 px-3 py-1.5"
                aria-expanded={snoozeOpen}
                onClick={() => setSnoozeOpen(!snoozeOpen)}
              >
                <Clock className="size-4" aria-hidden /> Snooze
              </button>
              {snoozeOpen && (
                <div className="slab absolute bottom-full left-0 z-10 mb-2 w-40 p-1.5">
                  {snoozeOptions().map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className="quiet block w-full px-3 py-1.5 text-left"
                      onClick={() => {
                        setSnoozeOpen(false)
                        onUpdate(save, 'snoozed', option.until)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="quiet inline-flex items-center gap-1.5 px-3 py-1.5" onClick={() => onUpdate(save, 'dismissed')}>
              <X className="size-4" aria-hidden /> Dismiss
            </button>
          </>
        ) : (
          <button type="button" className="quiet inline-flex items-center gap-1.5 px-3 py-1.5" onClick={() => onUpdate(save, 'inbox')}>
            <Inbox className="size-4" aria-hidden /> Back to inbox
          </button>
        )}
        <span className="flex-1" />
        {safeHref(save.permalink) && (
          <a href={safeHref(save.permalink)} target="_blank" rel="noreferrer" className="quiet inline-flex items-center gap-1.5 px-3 py-1.5">
            Open <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </article>
  )
}
