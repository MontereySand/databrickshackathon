import type { ReactNode } from "react"

import { cn } from "@/client/lib/utils"

interface MessageProps {
  children: ReactNode
  role?: "assistant" | "user" | "status"
  className?: string
}

function Message({ children, role = "assistant", className }: MessageProps) {
  return (
    <article
      className={cn(
        "grid max-w-[96%] gap-1 border px-2.5 py-2 text-xs leading-relaxed",
        role === "user" &&
          "ml-auto border-border bg-muted/35 text-right",
        role === "assistant" &&
          "border-[#FF3621]/55 bg-[#FF3621]/5 shadow-[inset_2px_0_0_#FF3621]",
        role === "status" &&
          "w-fit border-[#FF3621]/40 bg-[#FF3621]/5 px-2 py-1",
        className
      )}
      data-role={role}
    >
      {children}
    </article>
  )
}

function MessageHeader({
  children,
  icon,
  className,
}: {
  children: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {icon}
      <p className="truncate font-medium">{children}</p>
    </div>
  )
}

function MessageContent({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("min-w-0 text-muted-foreground", className)}>
      {children}
    </div>
  )
}

export { Message, MessageContent, MessageHeader }
