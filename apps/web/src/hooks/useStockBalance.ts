import { useState, useEffect } from 'react'
import { api } from '../lib/axios'

interface StockBalance {
  product_id: string
  location_id: string
  qty_on_hand: number
  qty_reserved: number
  available: number
  average_cost: number
}

export function useStockBalance(productId: string, locationId: string) {
  const [balance, setBalance] = useState<StockBalance | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!productId || !locationId) {
      setBalance(null)
      return
    }
    setLoading(true)
    api
      .get<StockBalance[]>('/inventory/balances', {
        params: { product_id: productId, location_id: locationId },
      })
      .then((r) => {
        const rows = r.data as unknown as StockBalance[]
        setBalance(rows[0] ?? null)
      })
      .catch(() => {
        setBalance(null)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [productId, locationId])

  return { balance, loading }
}
