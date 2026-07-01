import { useState, useEffect } from 'react'
import { api } from '../lib/axios'

interface FXRateResult {
  rate: number
  rateDate: string
  isStale: boolean
  ageHours: number
}

export function useFXRate(fromCurrency: string, toCurrency: string, date?: string) {
  const [result, setResult] = useState<FXRateResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) { setResult(null); return }
    setLoading(true)
    api
      .get<FXRateResult>('/finance/fx-rates/latest', {
        params: { from_currency: fromCurrency, to_currency: toCurrency, ...(date ? { date } : {}) },
      })
      .then((r) => setResult(r.data as unknown as FXRateResult))
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [fromCurrency, toCurrency, date])

  return { result, loading }
}
