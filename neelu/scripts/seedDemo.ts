/**
 * `npm run seed` — seed demo systems + scenario signals into the configured
 * database (PGlite dir or DATABASE_URL). Safe no-op if already seeded.
 *
 * Stop the dev server first if it holds a file-backed PGlite directory, since
 * PGlite allows a single connection per data directory.
 */

import { getDb, closeDb } from "../src/server/db/index";
import { ensureSeeded } from "../src/server/services/demo";

async function main(): Promise<void> {
  const db = await getDb();
  const seeded = await ensureSeeded(db);
  if (seeded) {
    console.log("Seeded demo data (3 systems, 3 scenario signals).");
  } else {
    console.log(
      "Database already has systems. Run `npm run reset-demo` to wipe and reseed.",
    );
  }
  await closeDb();
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
