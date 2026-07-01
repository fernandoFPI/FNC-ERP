export interface ApiResponse<T> {
  success: true
  data: T
  meta?: Record<string, unknown> | undefined
}

export interface ApiError {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface PaginatedResponse<T> {
  success: true
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export type ApiResult<T> = ApiResponse<T> | ApiError
