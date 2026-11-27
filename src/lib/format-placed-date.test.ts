import { describe, expect, test } from "bun:test";
import { formatPlacedDateTime } from "./format";

describe("order placed date display", () => {
  test("uses DD-MM-YYYY HH:MM:SS and discards fractional seconds", () => {
    expect(formatPlacedDateTime("2026-11-26T10:32:47.958Z")).toBe("26-11-2026 10:32:47");
    expect(formatPlacedDateTime("2026-01-02T00:00:00Z")).toBe("02-01-2026 00:00:00");
  });

  test("converts explicit offsets to Ghana time", () => {
    expect(formatPlacedDateTime("2026-01-02T01:02:03+02:00")).toBe("01-01-2026 23:02:03");
  });

  test("preserves display-only legacy labels without inventing seconds", () => {
    expect(formatPlacedDateTime("26 Nov 2026, 10:32")).toBe("26 Nov 2026, 10:32");
    expect(formatPlacedDateTime("")).toBe("—");
    expect(formatPlacedDateTime("2026-99-99T10:32:47Z")).toBe("—");
  });
});
