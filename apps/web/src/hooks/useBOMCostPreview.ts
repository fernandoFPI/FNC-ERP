import { useState, useEffect, useRef } from 'react'

export interface BOMLineInput {
  component_product_id: string
  qty: number
  unit_cost: number
}

export function useBOMCostPreview(lines: BOMLineInput[], qty = 1) {
  const [preview, setPreview] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      if (lines.length === 0) {
        setPreview(null)
        return
      }
      const componentCost = lines.reduce((s, l) => {
        if (!l.component_product_id) return s
        return s + l.qty * l.unit_cost
      }, 0)
      setPreview(componentCost * qty)
    }, 300)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [lines, qty])

  return preview
}
