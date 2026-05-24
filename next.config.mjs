/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3", "pg"],
  turbopack: {
    root: /* turbopackIgnore: true */ process.cwd(),
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
