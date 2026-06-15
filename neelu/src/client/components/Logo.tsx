import { RiDropFill } from "@remixicon/react";
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
      <span className="inline-flex size-8 items-center justify-center bg-primary/15 text-primary">
        <RiDropFill className="size-5" aria-hidden />
      </span>
      {showWordmark ? (
        <span className="flex flex-col leading-none">
          <span className="text-base font-semibold tracking-normal">Neelu</span>
        </span>
      ) : null}
    </span>
  );
}
