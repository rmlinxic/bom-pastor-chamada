import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

/** Hook autenticado: catequista vê apenas sua etapa, admin vê tudo */
export function useStudents() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ["students", user?.id, user?.etapa],
    queryFn: async () => {
      let query = supabase
        .from("students")
        .select("*")
        .eq("active", true)
        .order("class_name", { ascending: true })
        .order("name", { ascending: true });

      if (!isAdmin && user?.etapa) {
        query = query.eq("class_name", user.etapa);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
}

/** Hook público: usado na página de justificativas (sem login) */
export function usePublicStudents() {
  return useQuery({
    queryKey: ["students-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, name, class_name")
        .eq("active", true)
        .order("class_name", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; class_name: string }[];
    },
  });
}

export function useAddStudent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (student: {
      name: string;
      class_name: string;
      parent_name: string;
      phone: string;
    }) => {
      const { error } = await supabase.from("students").insert(student);
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
    }) => {
      const { error } = await supabase
        .from("students")
        .update({
          name: student.name,
          class_name: student.class_name,
          parent_name: student.parent_name,
          phone: student.phone,
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
      const { error } = await supabase
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
      const { data, error } = await supabase
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
      const { error } = await supabase.from("students").insert(students);
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
