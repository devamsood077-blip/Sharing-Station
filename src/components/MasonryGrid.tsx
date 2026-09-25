import { Children, isValidElement, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  minColumnWidth: number
  gap: number
}

type ItemPos = { left: number; top: number; width: number }

export function MasonryGrid({ children, minColumnWidth, gap }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ items: ItemPos[]; height: number }>({ items: [], height: 0 })
  const childArray = Children.toArray(children)
  const signature = childArray.map((child) => (isValidElement(child) ? String(child.key) : '')).join('|')

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const pack = () => {
      const width = el.clientWidth
      if (!width) return
      const cols = Math.max(1, Math.floor((width + gap) / (minColumnWidth + gap)))
      const colWidth = (width - gap * (cols - 1)) / cols
      const heights = Array.from({ length: cols }, () => 0)
      const items: ItemPos[] = []
      const nodes = el.querySelectorAll<HTMLElement>('[data-masonry-item]')
      nodes.forEach((node) => {
        const col = heights.indexOf(Math.min(...heights))
        const h = node.offsetHeight
        items.push({ left: col * (colWidth + gap), top: heights[col], width: colWidth })
        heights[col] += h + gap
      })
      const height = Math.max(0, ...heights.map((value) => (value > 0 ? value - gap : 0)))
      setLayout({ items, height })
    }

    const ro = new ResizeObserver(pack)
    ro.observe(el)
    el.querySelectorAll('[data-masonry-item]').forEach((node) => ro.observe(node))
    pack()
    return () => ro.disconnect()
  }, [gap, minColumnWidth, signature])

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: layout.height || undefined }}>
      {childArray.map((child, index) => {
        const pos = layout.items[index]
        return (
          <div
            key={typeof child === 'object' && child && 'key' in child && child.key != null ? String(child.key) : index}
            data-masonry-item
            className="absolute top-0 left-0"
            style={
              pos
                ? { width: pos.width, transform: `translate(${pos.left}px, ${pos.top}px)` }
                : { width: minColumnWidth, visibility: 'hidden' }
            }
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}
