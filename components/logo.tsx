import { cn } from "@/lib/utils"

type LogoProps = {
  size?: number
  className?: string
  alt?: string
}

export function Logo({ size = 32, className, alt = "Artifacta" }: LogoProps) {
  const style = { width: size, height: size }

  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-light-512.png"
        alt={alt}
        width={size}
        height={size}
        className="size-full object-contain dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-dark-512.png"
        alt={alt}
        width={size}
        height={size}
        className="hidden size-full object-contain dark:block"
      />
    </span>
  )
}
