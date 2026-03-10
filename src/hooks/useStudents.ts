import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const db = supabase as any;

/** Hook autenticado: coordenador vê toda a paróquia, catequista vê só seus alunos, admin vê tudo */
export function useStudents() {
  const { user, isAdmin, isCoordinator } = useAuth();

  return useQuery({
    queryKey: ["students", user?.id, isCoordinator, user?.paroquia_id],
    queryFn: async () => {
      let query = db
        .from("students")
        .select("*, catequistas(name), paroquias(nome)")
        .eq("active", true)
        .order("class_name", { ascending: true })
        .order("name", { ascending: true });

      if (isAdmin) {
        // Admin: vê tudo, sem filtro
      } else if (isCoordinator && user?.paroquia_id) {
        // Coordenador (puro ou catequista+coordenador): filtra por paróquia
        query = query.eq("paroquia_id", user.paroquia_id);
      } else if (user?.id) {
        // Catequista: apenas seus alunos
        query = query.or(
          `catequista_id.eq.${user.id},and(catequista_id.is.null,class_name.eq.${
            user.etapa ?? "__nenhuma__"
          })`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as any[]).map((s) => ({
        ...s,
        catequista_nome: s.catequistas?.name ?? null,
        paroquia_nome: s.paroquias?.nome ?? null,
      }));
    },
    enabled: !!user,
  });
}

/** Hook público: usado na página de justificativas (sem login) */
export function usePublicStudents() {
  return useQuery({
    queryKey: ["students-public"],
    queryFn: async () => {
      const { data, error } = await db
        .from("students")
        .select("id, name, class_name, paroquia_id, paroquias(nome)")
        .eq("active", true)
        .order("class_name", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map((s) => ({
        ...s,
        paroquia_nome: s.paroquias?.nome ?? null,
      })) as { id: string; name: string; class_name: string; paroquia_id: string | null; paroquia_nome: string | null }[];
    },
  });
}

export function useAddStudent() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (student: {
      name: string;
      class_name: string;
      parent_name: string;
      phone: string;
      catequista_id?: string | null;
      paroquia_id?: string | null;
    }) => {
      const payload = {
        ...student,
        catequista_id: isAdmin ? (student.catequista_id ?? null) : (user?.id ?? null),
        paroquia_id: isAdmin ? (student.paroquia_id ?? null) : (user?.paroquia_id ?? null),
        class_name: isAdmin ? student.class_name : (user?.etapa ?? student.class_name),
      };
      const { error } = await db.from("students").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-public"] });
      toast.success("Aluno cadastrado com sucesso!");
    },
    onError: () => toast.error("Erro ao cadastrar aluno."),
  });
}

export function useUpdateStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (student: {
      id: string;
      name: string;
      class_name: string;
      parent_name: string;
      phone: string;
      catequista_id?: string | null;
      paroquia_id?: string | null;
    }) => {
      const { error } = await db
        .from("students")
        .update({
          name: student.name,
          class_name: student.class_name,
          parent_name: student.parent_name,
          phone: student.phone,
          ...(student.catequista_id !== undefined ? { catequista_id: student.catequista_id } : {}),
          ...(student.paroquia_id !== undefined ? { paroquia_id: student.paroquia_id } : {}),
        })
        .eq("id", student.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-public"] });
      toast.success("Aluno atualizado com sucesso!");
    },
    onError: () => toast.error("Erro ao atualizar aluno."),
  });
}

export function useDeleteStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from("students")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-public"] });
      toast.success("Aluno removido.");
    },
    onError: () => toast.error("Erro ao remover aluno."),
  });
}

export function useStudentAttendanceHistory(studentId: string | null) {
  return useQuery({
    queryKey: ["student-history", studentId],
    queryFn: async () => {
      const { data, error } = await db
        .from("attendance")
        .select("*")
        .eq("student_id", studentId!)
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });
}

export function useImportStudents() {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      students: {
        name: string;
        class_name: string;
        parent_name: string;
        phone: string;
      }[]
    ) => {
      const payload = students.map((s) => ({
        ...s,
        catequista_id: isAdmin ? null : (user?.id ?? null),
        paroquia_id: isAdmin ? null : (user?.paroquia_id ?? null),
        class_name: isAdmin ? s.class_name : (user?.etapa ?? s.class_name),
      }));
      const { error } = await db.from("students").insert(payload);
      if (error) throw error;
      return students.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["students"] });
      queryClient.invalidateQueries({ queryKey: ["students-public"] });
      toast.success(`${count} aluno(s) importado(s) com sucesso!`);
    },
    onError: (err: Error) => {
      toast.error(`Erro ao importar: ${err.message}`);
    },
  });
}
