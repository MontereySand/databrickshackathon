import { RiFlashlightFill } from "@remixicon/react";
import { cn } from "@/client/lib/utils";

export function Logo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex size-7 items-center justify-center rounded-md bg-primary/15 text-primary">
        <RiFlashlightFill className="size-4" aria-hidden />
      </span>
      {showWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">Neelu</span>
          <span className="text-[0.625rem] text-muted-foreground">
            Water Evidence Ledger
          </span>
        </span>
      ) : null}
    </span>
  );
}
