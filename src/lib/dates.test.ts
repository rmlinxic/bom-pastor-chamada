import { describe, expect, it } from "vitest";
import { isCatechesisSaturday, latestCatechesisSaturday, localDateString, localMonthString, monthDateRange, shiftMonth, parseLocalDate } from "./dates";

describe("datas de calendário", () => {
  it("aceita datas reais e rejeita dias que transbordam para outro mês", () => {
    expect(localDateString(parseLocalDate("2024-02-29")!)).toBe("2024-02-29");
    for (const value of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-01", "2026-04-00", "12/10/2026", "", "0026-10-12"]) expect(parseLocalDate(value)).toBeNull();
  });
  it("mantém o dia e mês locais à noite, mesmo quando UTC já avançou", () => {
    const date = new Date(2026, 9, 31, 23, 30);
    expect(localDateString(date)).toBe("2026-10-31");
    expect(localMonthString(date)).toBe("2026-10");
  });

  it("identifica apenas sábados válidos para catequese", () => {
    expect(isCatechesisSaturday("2026-10-10")).toBe(true);
    for (const value of ["2026-10-11", "2026-10-12", "2026-10-09", "2026-02-31", "invalid"]) expect(isCatechesisSaturday(value)).toBe(false);
  });

  it("encontra o sábado local mais recente, incluindo hoje, sem alterar a data recebida", () => {
    const saturday = new Date(2026, 9, 10, 23, 30);
    expect(latestCatechesisSaturday(saturday)).toBe("2026-10-10");
    expect(saturday.getHours()).toBe(23);
    expect(latestCatechesisSaturday(new Date(2026, 9, 11, 0, 15))).toBe("2026-10-10");
    expect(latestCatechesisSaturday(new Date(2026, 9, 12, 23, 50))).toBe("2026-10-10");
    expect(latestCatechesisSaturday(new Date(2027, 0, 1, 12))).toBe("2026-12-26");
  });

  it("navega entre anos e calcula meses de durações diferentes", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthDateRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthDateRange("2026-02").end).toBe("2026-02-28");
    expect(monthDateRange("2026-04").end).toBe("2026-04-30");
  });
});
