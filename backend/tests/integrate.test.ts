import { describe, expect, test } from "bun:test";
import { normalizeDay, normalizeSlots } from "../src/services/integrate.service";

describe("normalizeDay", () => {
  test("accepts numbers", () => {
    expect(normalizeDay(0)).toBe(0);
    expect(normalizeDay(4)).toBe(4);
  });

  test("maps day names case-insensitively", () => {
    expect(normalizeDay("Monday")).toBe(0);
    expect(normalizeDay("tuesday")).toBe(1);
    expect(normalizeDay("WED")).toBe(2);
    expect(normalizeDay("Thu")).toBe(3);
    expect(normalizeDay("friday")).toBe(4);
  });

  test("throws on unknown days", () => {
    expect(() => normalizeDay("Sunday")).toThrow();
  });
});

describe("normalizeSlots", () => {
  test("dedupes (day, period) collisions keeping the first", () => {
    const rows = [
      { day: "Monday", period: 1, course: "First", code: null, room: null, faculty: null },
      { day: 0, period: 1, course: "Duplicate", code: null, room: null, faculty: null },
      { day: "Monday", period: 2, course: "Second", code: null, room: null, faculty: null },
    ];
    const slots = normalizeSlots(rows as any);
    expect(slots).toHaveLength(2);
    expect(slots[0].course).toBe("First");
    expect(slots[0].day).toBe(0);
  });

  test("expands nothing but preserves order", () => {
    const rows = [
      { day: "Friday", period: 3, course: "X", code: null, room: null, faculty: null },
      { day: "Monday", period: 1, course: "Y", code: null, room: null, faculty: null },
    ];
    const slots = normalizeSlots(rows as any);
    expect(slots.map((s) => s.course)).toEqual(["X", "Y"]);
  });
});
