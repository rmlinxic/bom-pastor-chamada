import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAddStudent, useUpdateStudent } from "@/hooks/useStudents";
import { useAuth } from "@/contexts/AuthContext";
import { ETAPAS } from "@/lib/etapas";

interface StudentFormProps {
  student?: {
    id: string;
    name: string;
    class_name: string;
    parent_name: string;
    phone: string;
    catequista_id?: string | null;
    paroquia_id?: string | null;
  } | null;
  onClose: () => void;
}

export default function StudentForm({ student, onClose }: StudentFormProps) {
  const { isAdmin, isCoordinator, user } = useAuth();
  const addMutation = useAddStudent();
  const updateMutation = useUpdateStudent();
  const canChooseEtapa = isAdmin || isCoordinator;

  const defaultEtapa = isAdmin || isCoordinator ? ETAPAS[0] : (user?.etapa ?? ETAPAS[0]);

  const [form, setForm] = useState({
    name: student?.name ?? "",
    class_name: student?.class_name ?? defaultEtapa,
    parent_name: student?.parent_name ?? "",
    phone: student?.phone ?? "",
  });

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name,
        class_name: student.class_name,
        parent_name: student.parent_name,
        phone: student.phone,
      });
    }
  }, [student?.id]);

  const isEditing = !!student;
  const isPending = addMutation.isPending || updateMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (isEditing) {
      updateMutation.mutate({ id: student!.id, ...form }, { onSuccess: onClose });
    } else {
      addMutation.mutate(form, { onSuccess: onClose });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-t-2xl bg-background p-6 pb-10 shadow-xl animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold">{isEditing ? "Editar Aluno" : "Novo Aluno"}</h2>
          <button onClick={onClose}
            className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Nome do aluno *</label>
            <Input value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nome completo" required />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Etapa</label>
            {canChooseEtapa ? (
              <Select value={form.class_name}
                onValueChange={(v) => setForm((p) => ({ ...p, class_name: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <>
                <Input value={form.class_name} disabled className="opacity-60" />
                <p className="text-xs text-muted-foreground">Definida pela sua etapa cadastrada.</p>
              </>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Nome do responsável</label>
            <Input value={form.parent_name}
              onChange={(e) => setForm((p) => ({ ...p, parent_name: e.target.value }))}
              placeholder="Nome do pai/mãe/responsável" />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Telefone / WhatsApp</label>
            <Input value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="(41) 99999-9999" type="tel" />
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={isPending || !form.name.trim()}>
              {isPending ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
