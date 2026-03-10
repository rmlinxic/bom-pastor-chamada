import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAddStudent, useUpdateStudent } from "@/hooks/useStudents";
import { useAuth } from "@/contexts/AuthContext";
import { ETAPAS, nomeTurma, parseTurma } from "@/lib/etapas";
import { sanitizeText, sanitizePhone } from "@/lib/security";

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

  const defaultParsed = parseTurma(
    student?.class_name ?? user?.etapa ?? ETAPAS[0]
  );

  const [form, setForm] = useState({
    name: student?.name ?? "",
    parent_name: student?.parent_name ?? "",
    phone: student?.phone ?? "",
  });
  const [etapa, setEtapa] = useState(defaultParsed.etapa || ETAPAS[0]);
  const [turma, setTurma] = useState(defaultParsed.turma);

  useEffect(() => {
    if (student) {
      const p = parseTurma(student.class_name);
      setForm({ name: student.name, parent_name: student.parent_name, phone: student.phone });
      setEtapa(p.etapa || ETAPAS[0]);
      setTurma(p.turma);
    }
  }, [student?.id]);

  const isEditing = !!student;
  const isPending = addMutation.isPending || updateMutation.isPending;
  const classNameFinal = nomeTurma(etapa, turma || undefined);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const payload = {
      name: sanitizeText(form.name, 200),
      parent_name: sanitizeText(form.parent_name, 200),
      phone: sanitizePhone(form.phone),
      class_name: classNameFinal,
    };
    if (isEditing) {
      updateMutation.mutate({ id: student!.id, ...payload }, { onSuccess: onClose });
    } else {
      addMutation.mutate(payload, { onSuccess: onClose });
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
            <Input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              onBlur={(e) => setForm((p) => ({ ...p, name: sanitizeText(e.target.value, 200) }))}
              placeholder="Nome completo"
              maxLength={200}
              required
            />
          </div>

          {/* Etapa */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Etapa</label>
            {canChooseEtapa ? (
              <Select value={etapa} onValueChange={(v) => { setEtapa(v); setTurma(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={nomeTurma(etapa, turma || undefined)} disabled className="opacity-60" />
            )}
          </div>

          {/* Turma */}
          {canChooseEtapa && (
            <div className="space-y-1">
              <label className="text-sm font-medium">
                Turma <span className="text-muted-foreground text-xs font-normal">(A, B, C... se houver subturmas)</span>
              </label>
              <Select value={turma || "__none__"} onValueChange={(v) => setTurma(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem subturma</SelectItem>
                  {["A","B","C","D","E","F","G","H"].map((l) => (
                    <SelectItem key={l} value={l}>Turma {l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-primary font-medium">Turma final: <strong>{classNameFinal}</strong></p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Nome do responsável</label>
            <Input
              value={form.parent_name}
              onChange={(e) => setForm((p) => ({ ...p, parent_name: e.target.value }))}
              onBlur={(e) => setForm((p) => ({ ...p, parent_name: sanitizeText(e.target.value, 200) }))}
              placeholder="Nome do pai/mãe/responsável"
              maxLength={200}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Telefone / WhatsApp</label>
            <Input
              value={form.phone}
              onChange={(e) => setForm((p) => ({ ...p, phone: sanitizePhone(e.target.value) }))}
              placeholder="(41) 99999-9999"
              type="tel"
              maxLength={20}
            />
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
