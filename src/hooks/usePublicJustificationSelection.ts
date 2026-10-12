import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseTurma } from "@/lib/etapas";
import { readAllRows } from "@/lib/query-pages";

const db = supabase as any;

export interface PublicJustificationClass {
  class_name: string;
}

export interface PublicJustificationStudent {
  id: string;
  name: string;
  class_name: string;
}

/** Public name-only roster. The RPCs expose no contact or attendance details. */
export function usePublicJustificationClasses(parishId: string) {
  return useQuery({
    queryKey: ["public-justification-classes", parishId],
    queryFn: async () => {
      return readAllRows<PublicJustificationClass>((from, to) =>
        db.rpc("public_justification_classes", { parish_id: parishId })
          .order("class_name", { ascending: true })
          .range(from, to),
      );
    },
    enabled: !!parishId,
    placeholderData: undefined,
  });
}

export function usePublicJustificationStudents(parishId: string, stage: string) {
  return useQuery({
    queryKey: ["public-justification-students", parishId, stage],
    queryFn: async () => {
      return readAllRows<PublicJustificationStudent>((from, to) =>
        db.rpc("public_justification_students", { parish_id: parishId, stage })
          .order("class_name", { ascending: true })
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
    },
    enabled: !!parishId && !!stage,
    placeholderData: undefined,
  });
}

export function publicJustificationStages(classes: PublicJustificationClass[]): string[] {
  return [...new Set(classes.map(({ class_name }) => parseTurma(class_name).etapa))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function publicJustificationStudentsForStage(
  students: PublicJustificationStudent[],
  stage: string,
): PublicJustificationStudent[] {
  return students
    .filter((student) => parseTurma(student.class_name).etapa === stage)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.class_name.localeCompare(b.class_name, "pt-BR"));
}

export function publicJustificationClassSuffix(className: string, stage: string): string {
  return parseTurma(className).etapa === stage ? parseTurma(className).turma : "";
}
