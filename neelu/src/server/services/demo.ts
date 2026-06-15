/**
 * Deterministic demo seeding + reset. Seeds three systems and three scenario
 * signals (primary: high nitrate near a school) so the app is usable immediately
 * and the demo is reproducible across resets.
 */

import type { Db } from "../db"
import { latLngToCell } from "h3-js"
import {
  countSystems,
  deleteAllData,
  insertDemoRun,
  insertSignal,
  insertSystem,
  insertWaterPoint,
  writeAuditEvent,
} from "../db/repositories"
import { SCENARIOS, SYSTEMS } from "../data/scenarios"
import {
  CONTAMINANT_THRESHOLDS,
  DEFAULT_DEMO_SCENARIO_NAME,
  DEFAULT_DEMO_SEED,
} from "../../shared/constants"
import type { DemoResetInput } from "../../shared/schemas"
import type { DemoResetSummary } from "../../shared/types"

export type SeedSummary = DemoResetSummary

function dateStringFromOffset(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
}

function isoFromMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString()
}

export async function seedDemo(
  db: Db,
  options: { seed?: number; scenarioName?: string } = {}
): Promise<SeedSummary> {
  const seed = options.seed ?? DEFAULT_DEMO_SEED
  const scenarioName = options.scenarioName ?? DEFAULT_DEMO_SCENARIO_NAME

  for (const system of SYSTEMS) {
    await insertSystem(db, {
      systemId: system.systemId,
      name: system.name,
      region: system.region,
      country: system.country,
      populationServed: system.populationServed,
      systemType: system.systemType,
      sourceWaterType: system.sourceWaterType,
      latitude: system.latitude,
      longitude: system.longitude,
    })
    const quality =
      system.systemId === "sys-school"
        ? "contaminated"
        : system.systemId === "sys-clinic"
          ? "caution"
          : "clean"
    await insertWaterPoint(db, {
      pointId: `WPT-${system.systemId.toUpperCase()}`,
      systemId: system.systemId,
      name: `${system.name} source`,
      latitude: system.latitude ?? 0,
      longitude: system.longitude ?? 0,
      h3Cell: latLngToCell(system.latitude ?? 0, system.longitude ?? 0, 8),
      quality,
      contaminant:
        quality === "contaminated"
          ? "nitrate"
          : quality === "caution"
            ? "coliform bacteria"
            : null,
      populationServed: system.populationServed,
    })
  }

  for (const scenario of SCENARIOS) {
    const threshold = CONTAMINANT_THRESHOLDS[scenario.testType]
    const signal = await insertSignal(db, {
      signalId: scenario.signalId,
      systemId: scenario.systemId,
      signalType: "field_test",
      testType: scenario.testType,
      resultValue: scenario.resultValue,
      unit: scenario.unit,
      thresholdValue: threshold.thresholdValue,
      thresholdUnit: threshold.thresholdUnit,
      kitId: scenario.kitId,
      kitExpiresAt: dateStringFromOffset(scenario.kitExpiryOffsetDays),
      locationLabel: scenario.locationLabel,
      notes: scenario.notes,
      photoRef: null,
      synthetic: true,
      receivedAt: isoFromMinutesAgo(scenario.receivedMinutesAgo),
      payloadJson: { scenarioId: scenario.id, seeded: true },
    })
    await writeAuditEvent(db, {
      entityType: "signal",
      entityId: signal.signalId,
      actor: scenario.submittedBy,
      action: "signal_submitted",
      after: signal,
    })
  }

  const run = await insertDemoRun(db, scenarioName, seed)
  await writeAuditEvent(db, {
    entityType: "demo_run",
    entityId: run.runId,
    actor: "system",
    action: "demo_reset",
    after: {
      scenarioName,
      seed,
      systems: SYSTEMS.length,
      signals: SCENARIOS.length,
    },
  })

  return {
    systems: SYSTEMS.length,
    signals: SCENARIOS.length,
    scenarioName,
    seed,
  }
}

/** Seed only if the database has no systems yet (boot-time convenience). */
export async function ensureSeeded(db: Db): Promise<boolean> {
  const count = await countSystems(db)
  if (count > 0) return false
  await seedDemo(db)
  return true
}

export async function resetDemo(
  db: Db,
  input: DemoResetInput = {}
): Promise<SeedSummary> {
  await deleteAllData(db)
  return seedDemo(db, { seed: input.seed, scenarioName: input.scenario })
}
