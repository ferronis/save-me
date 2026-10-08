import { useEffect, useState } from 'react'

// How many card columns fit in an element, recomputed as it resizes.
export function useColumnCount(element: HTMLElement | null, minColumnWidth: number, gap: number) {
  const [count, setCount] = useState(1)

  useEffect(() => {
    if (!element) return
    const measure = () => setCount(Math.max(1, Math.floor((element.clientWidth + gap) / (minColumnWidth + gap))))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [element, minColumnWidth, gap])

  return count
}
