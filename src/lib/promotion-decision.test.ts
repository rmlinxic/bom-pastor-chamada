import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { applyPromotionDecision } from "./promotion-decision";

function query(data: unknown, error: unknown = null) {
  const result = { data, error };
  const builder = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), update: vi.fn(), insert: vi.fn(), single: vi.fn().mockResolvedValue(result), then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) };
  for (const method of [builder.select, builder.eq, builder.is, builder.update, builder.insert]) method.mockReturnValue(builder);
  return builder;
}
function scenario(year: number | null, pendingYear: number, updateError: unknown = null, pendingStudent = "s") {
  const planned = query({ student_id: pendingStudent, ano_catequetico: pendingYear, decisao: null, destino_class_name: "Quinta Etapa", destino_catequista_id: "teacher-next" });
  const student = query({ id: "s", class_name: "Quarta Etapa", ano_catequetico: year });
  const enrollmentUpdate = query({ id: "s" }, updateError), decisionUpdate = query({ id: "pending" }), log = query(null);
  const from = vi.fn().mockReturnValueOnce(planned).mockReturnValueOnce(student).mockReturnValueOnce(enrollmentUpdate).mockReturnValueOnce(decisionUpdate).mockReturnValueOnce(log);
  return { client: { from } as unknown as SupabaseClient<Database>, from, enrollmentUpdate, decisionUpdate, log, planned, student };
}
const input = { id: "pending", studentId: "s", parishId: "p", staffId: "staff", decision: "promovido" as const };
describe("year decision safeguards", () => {
  it("does not regress a newer enrollment when opening an old pending decision", async () => {
    const state = scenario(2026, 2024);
    await expect(applyPromotionDecision(state.client, input)).rejects.toThrow("O ano do cadastro não corresponde");
    expect(state.enrollmentUpdate.update).not.toHaveBeenCalled();
    expect(state.decisionUpdate.update).not.toHaveBeenCalled();
  });
  it("does not infer a historical year for a legacy enrollment with no year", async () => {
    const state = scenario(null, new Date().getFullYear() - 1);
    await expect(applyPromotionDecision(state.client, input)).rejects.toThrow("O ano do cadastro não corresponde");
    expect(state.enrollmentUpdate.update).not.toHaveBeenCalled();
  });
  it("applies the saved destination to a matching year with conditional enrollment filters", async () => {
    const state = scenario(2025, 2025);
    await applyPromotionDecision(state.client, input);
    expect(state.enrollmentUpdate.update).toHaveBeenCalledWith({ class_name: "Quinta Etapa", catequista_id: "teacher-next", ano_catequetico: 2026 });
    expect(state.enrollmentUpdate.eq).toHaveBeenCalledWith("ano_catequetico", 2025);
    expect(state.enrollmentUpdate.eq).toHaveBeenCalledWith("class_name", "Quarta Etapa");
    expect(state.decisionUpdate.is).toHaveBeenCalledWith("decisao", null);
    expect(state.log.insert).toHaveBeenCalled();
  });
  it("preserves compatibility for a current-year legacy enrollment", async () => {
    const state = scenario(null, new Date().getFullYear());
    await applyPromotionDecision(state.client, input);
    expect(state.enrollmentUpdate.is).toHaveBeenCalledWith("ano_catequetico", null);
  });
  it("stops before recording a decision if the enrollment changed concurrently", async () => {
    const state = scenario(2025, 2025, { code: "PGRST116" });
    await expect(applyPromotionDecision(state.client, input)).rejects.toThrow("O cadastro mudou");
    expect(state.decisionUpdate.update).not.toHaveBeenCalled();
    expect(state.log.insert).not.toHaveBeenCalled();
  });
  it("rejects a mismatched student before reading or changing another enrollment", async () => {
    const state = scenario(2025, 2025, null, "another-student");
    await expect(applyPromotionDecision(state.client, input)).rejects.toThrow("não corresponde ao cadastro");
    expect(state.from).toHaveBeenCalledTimes(1);
  });
  it("retains a matching student without changing class or year", async () => {
    const state = scenario(2025, 2025);
    state.from.mockReset().mockReturnValueOnce(state.planned).mockReturnValueOnce(state.student).mockReturnValueOnce(state.decisionUpdate).mockReturnValueOnce(state.log);
    await applyPromotionDecision(state.client, { ...input, decision: "retido" });
    expect(state.enrollmentUpdate.update).not.toHaveBeenCalled();
    expect(state.decisionUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ decisao: "retido" }));
  });
});
