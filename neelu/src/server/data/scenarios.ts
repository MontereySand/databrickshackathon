/**
 * Seed systems and demo scenarios. Used by the boot auto-seed, the seed/reset
 * scripts, and POST /api/demo/reset. Signal ids are stable per scenario so the
 * demo is reproducible across resets.
 */

import type { ScenarioId, TestType } from "../../shared/constants";
import { PRIMARY_SCENARIO_ID } from "../../shared/constants";
import type { InsertSystemInput } from "../db/repositories";

export interface SystemSeed extends InsertSystemInput {
  systemId: string;
  riskNotes: string;
}

export const SYSTEMS: SystemSeed[] = [
  {
    systemId: "sys-village",
    name: "Neelu Demo Village Water Point",
    region: "Maharashtra",
    country: "IN",
    populationServed: 2400,
    systemType: "community handpump + storage",
    sourceWaterType: "groundwater",
    latitude: 19.7515,
    longitude: 75.7139,
    riskNotes:
      "Shallow groundwater source; recurring turbidity complaints after monsoon and pipe work.",
  },
  {
    systemId: "sys-school",
    name: "North School Tap",
    region: "Maharashtra",
    country: "IN",
    populationServed: 680,
    systemType: "school supply tap",
    sourceWaterType: "groundwater (borewell)",
    latitude: 19.8762,
    longitude: 75.3433,
    riskNotes:
      "Serves a primary school with children under 6; agricultural runoff nearby raises nitrate risk.",
  },
  {
    systemId: "sys-clinic",
    name: "Hill Clinic Supply",
    region: "Himachal Pradesh",
    country: "IN",
    populationServed: 320,
    systemType: "clinic rooftop tank",
    sourceWaterType: "spring-fed",
    latitude: 31.1048,
    longitude: 77.1734,
    riskNotes:
      "Critical facility (clinic). Intermittent chlorination; spring source vulnerable to fecal ingress.",
  },
];

export interface ScenarioSeed {
  id: ScenarioId;
  name: string;
  description: string;
  isPrimary: boolean;
  signalId: string;
  systemId: string;
  testType: TestType;
  resultValue: number;
  unit: string;
  kitId: string;
  /** Days from "now" until kit expiry (negative => expired). */
  kitExpiryOffsetDays: number;
  locationLabel: string;
  notes: string;
  submittedBy: string;
  /** Minutes ago the signal was received (for a realistic queue order). */
  receivedMinutesAgo: number;
}

export const SCENARIOS: ScenarioSeed[] = [
  {
    id: "nitrate_school",
    name: "High nitrate field result near school",
    description:
      "A field nitrate reading well above the 10 mg/L reference value at a tap serving a primary school with young children.",
    isPrimary: true,
    signalId: "SIG-NITRATE-SCHOOL",
    systemId: "sys-school",
    testType: "nitrate",
    resultValue: 18.4,
    unit: "mg/L",
    kitId: "KIT-NA-2207",
    kitExpiryOffsetDays: 120,
    locationLabel: "Tap beside primary school kitchen",
    notes:
      "Routine screening flagged high nitrate. School serves children under 6. Requesting urgent review.",
    submittedBy: "field-worker (Asha)",
    receivedMinutesAgo: 12,
  },
  {
    id: "coliform_expired_kit",
    name: "Positive coliform with expired kit uncertainty",
    description:
      "A presence/absence coliform kit returned positive, but the test kit was past its expiration date, raising uncertainty.",
    isPrimary: false,
    signalId: "SIG-COLIFORM-CLINIC",
    systemId: "sys-clinic",
    testType: "total_coliform",
    resultValue: 1,
    unit: "CFU/100mL",
    kitId: "KIT-CO-1185",
    kitExpiryOffsetDays: -38,
    locationLabel: "Clinic rooftop tank outlet",
    notes:
      "Presence detected. Kit expiration date appears to have passed; please confirm before action.",
    submittedBy: "field-worker (Vikram)",
    receivedMinutesAgo: 47,
  },
  {
    id: "turbidity_pipe_repair",
    name: "Turbidity complaints after pipe repair",
    description:
      "Elevated turbidity following a distribution pipe repair, with no confirmatory microbiological sample collected yet.",
    isPrimary: false,
    signalId: "SIG-TURBIDITY-VILLAGE",
    systemId: "sys-village",
    testType: "turbidity",
    resultValue: 7.2,
    unit: "NTU",
    kitId: "KIT-TU-3390",
    kitExpiryOffsetDays: 210,
    locationLabel: "Main storage tank outlet (post-repair)",
    notes:
      "Residents report cloudy water after yesterday's pipe repair. No confirmatory lab sample collected yet.",
    submittedBy: "field-worker (Meena)",
    receivedMinutesAgo: 95,
  },
];

export function primaryScenario(): ScenarioSeed {
  const scenario = SCENARIOS.find((s) => s.id === PRIMARY_SCENARIO_ID);
  if (!scenario) throw new Error("Primary scenario missing from seed data");
  return scenario;
}
