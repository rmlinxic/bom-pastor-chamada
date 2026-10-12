import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { readAllRows } from "@/lib/query-pages";
import { isCatechesisSaturday, parseLocalDate } from "@/lib/dates";
import { buildPendingCenter, canReviewPromotions, scopePendingStudents, type PendingScope, type PendingUser, type PendingStudent, type PendingAttendance, type PendingDocuments, type PendingJustification, type PendingPromotion } from "@/lib/pending-center";

const ID_CHUNK_SIZE = 100;
/** PostgREST OR values must remain quoted if a class name contains punctuation. */
function ownFilter(user: PendingUser) {
  return `catequista_id.eq.${JSON.stringify(user.id)},and(catequista_id.is.null,class_name.eq.${JSON.stringify(user.etapa ?? "__nenhuma__")},${user.paroquia_id ? `paroquia_id.eq.${JSON.stringify(user.paroquia_id)}` : "paroquia_id.is.null"})`;
}

export async function loadPendingCenter(user: PendingUser, date: string, scope: PendingScope) {
  if (!parseLocalDate(date)) throw new Error("Selecione uma data válida.");
  if (!isCatechesisSaturday(date)) throw new Error("As pendências de chamada estão disponíveis somente aos sábados.");
  let query = supabase.from("students").select("id,name,class_name,catequista_id,paroquia_id,active,paroquias(nome)").eq("active", true);
  if (user.role !== "admin") {
    query = canReviewPromotions(user) && user.paroquia_id ? query.eq("paroquia_id", user.paroquia_id) : query.or(ownFilter(user));
  }
  if (scope.kind === "own") query = query.or(ownFilter(user));
  else if (scope.kind === "paroquia") query = query.eq("paroquia_id", scope.paroquia_id);
  else if (scope.kind === "etapa") {
    query = query.eq("class_name", scope.etapa);
    if (scope.paroquia_id) query = query.eq("paroquia_id", scope.paroquia_id);
  }
  query = query.order("id");
  const students = scopePendingStudents(await readAllRows<PendingStudent>((from, to) => query.range(from, to)), user, scope);
  const ids = students.map((student) => student.id);
  const attendance: PendingAttendance[] = [], documents: PendingDocuments[] = [], justifications: PendingJustification[] = [], promotions: PendingPromotion[] = [];
  for (let offset = 0; offset < ids.length; offset += ID_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + ID_CHUNK_SIZE);
    const [chunkAttendance, chunkDocuments, chunkJustifications, chunkPromotions] = await Promise.all([
      readAllRows((from, to) => supabase.from("attendance").select("student_id,date").in("student_id", chunk).eq("date", date).order("id").range(from, to)),
      readAllRows((from, to) => supabase.from("documentos_catequizando").select("student_id,batismo,endereco,crisma_padrinho,primeira_comunhao").in("student_id", chunk).order("id").range(from, to)),
      readAllRows((from, to) => supabase.from("pending_justifications").select("id,student_id,date,reason").in("student_id", chunk).order("id").range(from, to)),
      canReviewPromotions(user) ? readAllRows((from, to) => supabase.from("promocoes_pendentes").select("id,student_id,ano_catequetico,decisao,destino_class_name,score_faltas,faltas_nao_justificadas,meses_sem_missa").in("student_id", chunk).is("decisao", null).order("id").range(from, to)) : Promise.resolve([]),
    ]);
    attendance.push(...chunkAttendance); documents.push(...chunkDocuments); justifications.push(...chunkJustifications); promotions.push(...chunkPromotions);
  }
  return buildPendingCenter({ user, scope, date, students, attendance, documents, justifications, promotions });
}

export function usePendingCenter(date: string, scope: PendingScope) {
  const { user, isAdmin, isCoordinator } = useAuth();
  return useQuery({
    queryKey: ["pending-center", user?.id, user?.role, user?.is_coordenador, user?.paroquia_id, user?.etapa, isAdmin, isCoordinator, scope, date],
    queryFn: () => {
      if (!user) throw new Error("Entre novamente para consultar as pendências.");
      return loadPendingCenter(user, date, scope);
    },
    enabled: !!user && !!date,
    refetchInterval: 30_000,
  });
}
