import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/axios'
import type { InvoiceLineItem, BillingMethod } from '../components/ui/InvoiceBuilder'

export interface InvoicePreview {
  subtotal: number
  tax: number
  total: number
  lines: { description: string; amount: number }[]
}

interface PreviewParams {
  projectId: string
  billingMethod: BillingMethod
  lines: InvoiceLineItem[]
  percentage?: number
  milestoneIds?: string[]
}

export function useInvoicePreview(params: PreviewParams | null) {
  const [preview, setPreview] = useState<InvoicePreview | null>(null)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (!params) {
      setPreview(null)
      return
    }

    timerRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await api.post<InvoicePreview>(
          `/projects/${params.projectId}/invoice-preview`,
          {
            billing_method: params.billingMethod,
            lines: params.lines,
            percentage: params.percentage,
            milestone_ids: params.milestoneIds,
          },
        )
        setPreview(res.data)
      } catch {
        // compute client-side fallback
        const computedLines = params.lines.map((l) => ({
          description: l.description,
          amount: l.quantity * l.unit_price,
        }))
        const subtotal = computedLines.reduce((s, l) => s + l.amount, 0)
        const tax = params.lines.reduce(
          (s, l) => s + l.quantity * l.unit_price * ((l.tax_pct ?? 0) / 100),
          0,
        )
        setPreview({ subtotal, tax, total: subtotal + tax, lines: computedLines })
      } finally {
        setLoading(false)
      }
    }, 500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [params])

  return { preview, loading }
}
