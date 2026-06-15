/**
 * Signal intake service. Persists a field-test signal and writes the
 * signal_submitted audit event.
 */

import type { Db } from "../db";
import { getSystem, insertSignal, writeAuditEvent } from "../db/repositories";
import { NotFoundError } from "../lib/errors";
import { CONTAMINANT_THRESHOLDS, DEFAULT_FIELD_ACTOR } from "../../shared/constants";
import type { CreateSignalInput } from "../../shared/schemas";
import type { Signal } from "../../shared/types";

export async function submitSignal(
  db: Db,
  input: CreateSignalInput,
): Promise<Signal> {
  const system = await getSystem(db, input.systemId);
  if (!system) {
    throw new NotFoundError(`System ${input.systemId} not found`);
  }

  const threshold = CONTAMINANT_THRESHOLDS[input.testType];
  const actor = input.submittedBy ?? DEFAULT_FIELD_ACTOR;

  const signal = await insertSignal(db, {
    systemId: input.systemId,
    signalType: input.signalType,
    testType: input.testType,
    resultValue: input.resultValue,
    unit: input.unit,
    thresholdValue: threshold.thresholdValue,
    thresholdUnit: threshold.thresholdUnit,
    kitId: input.kitId ?? null,
    kitExpiresAt: input.kitExpiresAt ?? null,
    locationLabel: input.locationLabel ?? null,
    notes: input.notes ?? null,
    photoRef: input.photoRef ?? null,
    synthetic: true,
    payloadJson: { ...input, receivedVia: "field-intake" },
  });

  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor,
    action: "signal_submitted",
    after: signal,
  });

  return signal;
}
