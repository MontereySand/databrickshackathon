import type { HealthInfo } from "@/shared/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { SERVICE_LABELS } from "@/shared/constants";
import { serviceStatusColor, serviceStatusLabel } from "@/client/lib/format";
import { cn } from "@/client/lib/utils";
import { LoadingRows } from "./states";

export function ProofPanel({ health }: { health: HealthInfo | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Databricks services</CardTitle>
        <CardDescription>
          {health
            ? `Mode: ${health.mode} · v${health.version}`
            : "Probing services…"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {health ? (
          health.services.map((service) => (
            <div key={service.service} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-1 size-2 shrink-0 rounded-full",
                  serviceStatusColor(service.status),
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-xs font-medium">
                    {SERVICE_LABELS[service.service]}
                  </span>
                  <span className="text-[0.625rem] text-muted-foreground">
                    {serviceStatusLabel(service.status)}
                  </span>
                </div>
                <p className="text-[0.6875rem] leading-snug text-muted-foreground">
                  {service.detail}
                </p>
              </div>
            </div>
          ))
        ) : (
          <LoadingRows rows={5} />
        )}
      </CardContent>
    </Card>
  );
}
