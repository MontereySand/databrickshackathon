/**
 * `npm run reset-demo` — deterministically wipe all operational data and reseed
 * the demo systems + scenario signals. Records a demo_runs row.
 *
 * Optional args: `--seed <n>` `--scenario <name>`. Stop the dev server first if
 * it holds a file-backed PGlite directory.
 */

import { getDb, closeDb } from "../src/server/db/index";
import { resetDemo } from "../src/server/services/demo";

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const seedArg = argValue("--seed");
  const scenario = argValue("--scenario");
  const db = await getDb();
  const summary = await resetDemo(db, {
    seed: seedArg ? Number(seedArg) : undefined,
    scenario,
  });
  console.log(
    `Reset complete: ${summary.systems} systems, ${summary.signals} signals (scenario "${summary.scenarioName}", seed ${summary.seed}).`,
  );
  await closeDb();
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exit(1);
});
