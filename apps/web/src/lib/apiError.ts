import axios from 'axios'

export function apiErrMsg(e: unknown, fallback = 'Operation failed'): string {
  if (axios.isAxiosError(e)) {
    const body = e.response?.data as { error?: { message?: string }; message?: string } | undefined
    return body?.error?.message ?? body?.message ?? fallback
  }
  return (e as Error).message ?? fallback
}

export function apiErrCode(e: unknown): string | null {
  if (axios.isAxiosError(e)) {
    const body = e.response?.data as { error?: { code?: string } } | undefined
    return body?.error?.code ?? null
  }
  return null
}
