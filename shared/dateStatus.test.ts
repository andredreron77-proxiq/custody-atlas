import test from "node:test";
import assert from "node:assert/strict";
import { classifyDateStatus } from "./dateStatus";

test("classifyDateStatus returns upcoming for future date", () => {
  const status = classifyDateStatus("2026-04-10", new Date("2026-04-03T09:00:00.000Z"));
  assert.equal(status, "upcoming");
});

test("classifyDateStatus returns today for same-day date", () => {
  const status = classifyDateStatus("2026-04-03T23:59:00.000Z", new Date("2026-04-03T00:10:00.000Z"));
  assert.equal(status, "today");
});

test("classifyDateStatus returns past for prior date", () => {
  const status = classifyDateStatus("2026-03-12", new Date("2026-04-03T09:00:00.000Z"));
  assert.equal(status, "past");
});

test("classifyDateStatus returns unknown for unparseable date", () => {
  const status = classifyDateStatus("not a date", new Date("2026-04-03T09:00:00.000Z"));
  assert.equal(status, "unknown");
});
