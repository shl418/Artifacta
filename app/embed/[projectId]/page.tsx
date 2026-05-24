"use client"

import { useParams, useSearchParams } from "next/navigation"

export default function ProjectEmbedPage() {
  const params = useParams<{ projectId: string }>()
  const search = useSearchParams()
  const token = search.get("token") ?? ""
  const src = `/api/v1/projects/${params.projectId}/html/render${token ? `?embed_token=${encodeURIComponent(token)}` : ""}`

  return (
    <main className="fixed inset-0 bg-background">
      <iframe
        title="Artifacta embed"
        className="h-full w-full border-0 bg-white"
        src={src}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
      />
    </main>
  )
}
