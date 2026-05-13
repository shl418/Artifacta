import { NextResponse, type NextRequest } from "next/server"

const sessionCookieName = "artifacta_session"

const publicPrefixes = [
  "/login",
  "/view",
  "/api",
  "/_next",
  "/favicon.ico",
  "/icon",
  "/apple-icon",
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (publicPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next()
  }

  if (!request.cookies.has(sessionCookieName)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
}
