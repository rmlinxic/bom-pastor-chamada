import { useState, useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  const fieldId = useId();
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
  }, [student]);

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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="z-[60] flex max-h-[90dvh] w-[calc(100%_-_2rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6 pr-12 text-left">
          <DialogTitle>{isEditing ? "Editar Catequizando" : "Novo Catequizando"}</DialogTitle>
          <DialogDescription className="sr-only">Preencha os dados do catequizando e salve o cadastro.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col overflow-hidden">
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-2">
            <div className="space-y-1">
              <label htmlFor={`${fieldId}-name`} className="text-sm font-medium">Nome do catequizando *</label>
              <Input
                id={`${fieldId}-name`}
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
              <label htmlFor={`${fieldId}-etapa`} className="text-sm font-medium">Etapa</label>
              {canChooseEtapa ? (
                <Select value={etapa} onValueChange={(v) => { setEtapa(v); setTurma(""); }}>
                  <SelectTrigger id={`${fieldId}-etapa`}><SelectValue placeholder="Selecione a etapa" /></SelectTrigger>
                  <SelectContent>
                    {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input id={`${fieldId}-etapa`} value={nomeTurma(etapa, turma || undefined)} disabled className="opacity-60" />
              )}
            </div>

            {/* Turma */}
            {canChooseEtapa && (
              <div className="space-y-1">
                <label htmlFor={`${fieldId}-turma`} className="text-sm font-medium">
                  Turma <span className="text-muted-foreground text-xs font-normal">(A, B, C... se houver subturmas)</span>
                </label>
                <Select value={turma || "__none__"} onValueChange={(v) => setTurma(v === "__none__" ? "" : v)}>
                  <SelectTrigger id={`${fieldId}-turma`}><SelectValue /></SelectTrigger>
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
              <label htmlFor={`${fieldId}-parent`} className="text-sm font-medium">Nome do responsável</label>
              <Input
                id={`${fieldId}-parent`}
                value={form.parent_name}
                onChange={(e) => setForm((p) => ({ ...p, parent_name: e.target.value }))}
                onBlur={(e) => setForm((p) => ({ ...p, parent_name: sanitizeText(e.target.value, 200) }))}
                placeholder="Nome do pai/mãe/responsável"
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`${fieldId}-phone`} className="text-sm font-medium">Telefone / WhatsApp</label>
              <Input
                id={`${fieldId}-phone`}
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: sanitizePhone(e.target.value) }))}
                placeholder="(41) 99999-9999"
                type="tel"
                maxLength={20}
              />
            </div>
          </div>
          <div className="flex shrink-0 gap-3 border-t bg-background px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={isPending || !form.name.trim()}>
              {isPending ? "Salvando..." : isEditing ? "Salvar" : "Cadastrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
