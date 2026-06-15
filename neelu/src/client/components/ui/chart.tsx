import * as React from "react"

import { cn } from "@/client/lib/utils"

export type ChartConfig = Record<
  string,
  {
    label: string
    color: string
  }
>

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { config: ChartConfig }
>(({ className, children, config, ...props }, ref) => {
  const style = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [`--color-${key}`, item.color])
  ) as React.CSSProperties

  return (
    <div
      ref={ref}
      data-slot="chart"
      className={cn(
        "flex aspect-[16/9] w-full items-center justify-center text-xs text-muted-foreground [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-grid_line]:stroke-border [&_.recharts-tooltip-cursor]:fill-muted/40",
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
})

ChartContainer.displayName = "ChartContainer"

function ChartTooltipContent({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {label ? <div className="mb-1 font-medium">{label}</div> : null}
      <div className="grid gap-1">
        {payload.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-muted-foreground">{item.name}</span>
            <span className="font-medium text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export { ChartContainer, ChartTooltipContent }
