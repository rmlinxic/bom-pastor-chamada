import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { proximaEtapa } from "./etapas";

/** Legacy enrollments without a year may only be decided in the current year. */
export function promotionAppliesToYear(enrollmentYear: number | null, pendingYear: number, currentYear = new Date().getFullYear()) {
  return (enrollmentYear ?? currentYear) === pendingYear;
}

export async function applyPromotionDecision(client: SupabaseClient<Database>, input: { id: string; studentId: string; parishId: string; staffId: string; decision: "promovido" | "retido" }) {
  const { data: planned, error: plannedError } = await client.from("promocoes_pendentes")
    .select("student_id,destino_class_name,destino_catequista_id,ano_catequetico,decisao").eq("id", input.id).eq("paroquia_id", input.parishId).single();
  if (plannedError) throw plannedError;
  if (!planned || planned.student_id !== input.studentId) throw new Error("A pendência não corresponde ao cadastro selecionado.");
  if (planned.decisao) throw new Error("Esta decisão já foi registrada.");
  const { data: student, error: studentError } = await client.from("students").select("id,class_name,ano_catequetico")
    .eq("id", planned.student_id).eq("paroquia_id", input.parishId).eq("active", true).single();
  if (studentError) throw studentError;
  if (!student || !promotionAppliesToYear(student.ano_catequetico, planned.ano_catequetico)) throw new Error("O ano do cadastro não corresponde a esta pendência. Revise o cadastro antes de decidir.");
  if (input.decision === "promovido") {
    let update = client.from("students").update({ class_name: planned.destino_class_name ?? proximaEtapa(student.class_name), catequista_id: planned.destino_catequista_id ?? null, ano_catequetico: planned.ano_catequetico + 1 })
      .eq("id", student.id).eq("paroquia_id", input.parishId).eq("active", true).eq("class_name", student.class_name);
    update = student.ano_catequetico === null ? update.is("ano_catequetico", null) : update.eq("ano_catequetico", student.ano_catequetico);
    const { error } = await update.select("id").single();
    if (error) throw new Error("O cadastro mudou ou não pôde ser atualizado. Atualize a página e confira antes de repetir.");
  }
  const { error: decisionError } = await client.from("promocoes_pendentes").update({ decisao: input.decision, decidido_por: input.staffId, decidido_em: new Date().toISOString() })
    .eq("id", input.id).eq("paroquia_id", input.parishId).is("decisao", null).select("id").single();
  if (decisionError) throw new Error("A decisão não foi concluída. Confira o cadastro: algumas alterações podem ter sido salvas.");
  const { error: logError } = await client.from("activity_log").insert({ catequista_id: input.staffId, acao: "decisao_promocao", detalhes: { promocao_id: input.id, decisao: input.decision, paroquia_id: input.parishId } });
  if (logError) throw new Error("A decisão foi registrada, mas o histórico precisa ser conferido pela administração.");
}
