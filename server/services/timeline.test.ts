import test from "node:test";
import assert from "node:assert/strict";
import { isEquivalentRecentTimelineEvent } from "./timeline";

test("equivalent recent event is treated as duplicate", () => {
  const now = new Date("2026-04-02T12:00:00.000Z");

  const duplicate = isEquivalentRecentTimelineEvent(
    {
      description: "Analyzed document: order.pdf",
      createdAt: "2026-04-02T11:45:00.000Z",
    },
    {
      eventDate: "2026-04-02",
      description: "Analyzed document: order.pdf",
    },
    { now, recentWindowMs: 30 * 60 * 1000 },
  );

  assert.equal(duplicate, true);
});

test("same description outside recent window is not treated as duplicate", () => {
  const now = new Date("2026-04-02T12:00:00.000Z");

  const duplicate = isEquivalentRecentTimelineEvent(
    {
      description: "Already uploaded: order.pdf (analysis refreshed)",
      createdAt: "2026-04-02T10:00:00.000Z",
    },
    {
      eventDate: "2026-04-02",
      description: "Already uploaded: order.pdf (analysis refreshed)",
    },
    { now, recentWindowMs: 30 * 60 * 1000 },
  );

  assert.equal(duplicate, false);
});

test("cross-case reuse with different descriptions does not dedupe", () => {
  const now = new Date("2026-04-02T12:00:00.000Z");

  const duplicate = isEquivalentRecentTimelineEvent(
    {
      description: "Analyzed document: parenting-plan.pdf",
      createdAt: "2026-04-02T11:50:00.000Z",
    },
    {
      eventDate: "2026-04-02",
      description: "Analyzed document: custody-order.pdf",
    },
    { now, recentWindowMs: 30 * 60 * 1000 },
  );

  assert.equal(duplicate, false);
});
