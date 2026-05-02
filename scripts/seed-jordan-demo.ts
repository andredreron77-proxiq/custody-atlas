import { db } from "../server/db";
import { caseFacts } from "@shared/schema";

async function main(): Promise<void> {
  const rows = [
    {
      caseId: "4ee579e7-bef9-43cd-aad2-90020cbf3a13",
      userId: "a16e21fe-73fb-46d4-b930-97182bceeadf",
      factType: "hearing_date",
      value: "2026-06-14",
      source: "ai_extracted",
      confidence: "0.9",
      isActive: true,
    },
    {
      caseId: "4ee579e7-bef9-43cd-aad2-90020cbf3a13",
      userId: "a16e21fe-73fb-46d4-b930-97182bceeadf",
      factType: "filing_date",
      value: "2026-04-28",
      source: "ai_extracted",
      confidence: "0.9",
      isActive: true,
    },
  ] as const;

  const insertedRows = await db
    .insert(caseFacts)
    .values(rows)
    .onConflictDoNothing()
    .returning();

  console.log("[seed-jordan-demo] inserted rows", insertedRows);
}

main().catch((err) => {
  console.error("[seed-jordan-demo] failed", err);
  process.exit(1);
});
