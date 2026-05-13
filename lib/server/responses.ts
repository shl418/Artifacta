import { NextResponse } from "next/server"

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 })
}

export function noContent() {
  return new NextResponse(null, { status: 204 })
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    },
    { status }
  )
}

export function parsePagination(url: URL) {
  const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1)
  const perPage = Math.min(Math.max(Number(url.searchParams.get("per_page") ?? 20), 1), 100)
  return { page, perPage }
}

export function paginate<T>(items: T[], page: number, perPage: number) {
  const total = items.length
  const totalPages = Math.max(Math.ceil(total / perPage), 1)
  const start = (page - 1) * perPage
  const data = items.slice(start, start + perPage)

  return {
    data,
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: totalPages,
    },
  }
}
