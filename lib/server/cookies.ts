export function getCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
