import { describe, expect, it } from "vitest";
import { localDateString, localMonthString, monthDateRange, shiftMonth } from "./dates";

describe("datas de calendário", () => {
  it("mantém o dia e mês locais à noite, mesmo quando UTC já avançou", () => {
    const date = new Date(2026, 9, 31, 23, 30);
    expect(localDateString(date)).toBe("2026-10-31");
    expect(localMonthString(date)).toBe("2026-10");
  });

  it("navega entre anos e calcula meses de durações diferentes", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthDateRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthDateRange("2026-02").end).toBe("2026-02-28");
    expect(monthDateRange("2026-04").end).toBe("2026-04-30");
  });
});
