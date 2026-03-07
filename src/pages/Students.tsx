import { useState } from "react";
import { UserPlus, Pencil, History, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { useStudents, useAddStudent, useUpdateStudent, useStudentAttendanceHistory } from "@/hooks/useStudents";

const statusLabels: Record<string, string> = {
  presente: "Presente",
  falta_justificada: "Falta Justificada",
  falta_nao_justificada: "Falta Não Justificada",
};

const statusColors: Record<string, string> = {
  presente: "text-success",
  falta_justificada: "text-warning",
  falta_nao_justificada: "text-destructive",
};

export default function Students() {
  const { data: students = [] } = useStudents();
  const addMutation = useAddStudent();
  const updateMutation = useUpdateStudent();
  const [open, setOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const { data: history = [] } = useStudentAttendanceHistory(historyStudentId);

  const emptyForm = { name: "", class_name: "", parent_name: "", phone: "" };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setEditingStudent(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (s: typeof students[0]) => {
    setEditingStudent(s.id);
    setForm({ name: s.name, class_name: s.class_name, parent_name: s.parent_name, phone: s.phone });
    setOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.class_name.trim()) return;

    if (editingStudent) {
      updateMutation.mutate({ id: editingStudent, ...form }, {
        onSuccess: () => { setOpen(false); setForm(emptyForm); setEditingStudent(null); },
      });
    } else {
      addMutation.mutate(form, {
        onSuccess: () => { setOpen(false); setForm(emptyForm); },
      });
    }
  };

  const isPending = addMutation.isPending || updateMutation.isPending;

  // History view
  if (historyStudentId) {
    const student = students.find((s) => s.id === historyStudentId);
    return (
      <div className="pb-24">
        <div className="px-4 pt-6 pb-4">
          <Button variant="ghost" size="sm" onClick={() => setHistoryStudentId(null)} className="mb-2 -ml-2">
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{student?.name}</h1>
          <p className="text-sm text-muted-foreground">Histórico de presença</p>
        </div>
        <div className="px-4 space-y-2">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm">
              <span className="text-sm font-medium text-foreground">{h.date}</span>
              <span className={cn("text-sm font-semibold", statusColors[h.status])}>
                {statusLabels[h.status] ?? h.status}
              </span>
            </div>
          ))}
          {history.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">Nenhum registro encontrado.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <PageHeader title="Alunos" subtitle="Gerencie os catequizandos" />

      <div className="px-4 mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full h-12 text-base font-semibold" onClick={openAdd}>
              <UserPlus className="mr-2 h-5 w-5" />
              Novo Aluno
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 max-w-sm">
            <DialogHeader>
              <DialogTitle>{editingStudent ? "Editar Aluno" : "Cadastrar Aluno"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Aluno</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="class_name">Turma</Label>
                <Input id="class_name" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} placeholder="Ex: Crisma 2025" required />
              </div>
              <div>
                <Label htmlFor="parent_name">Nome do Responsável</Label>
                <Input id="parent_name" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(99) 99999-9999" required />
              </div>
              <Button type="submit" className="w-full h-12" disabled={isPending}>
                {isPending ? "Salvando..." : editingStudent ? "Atualizar" : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2 px-4">
        {students.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-4 shadow-sm animate-fade-in">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-foreground">{s.name}</p>
                <p className="text-sm text-primary font-medium">{s.class_name}</p>
                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Resp: {s.parent_name}</span>
                  <span>{s.phone}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setHistoryStudentId(s.id)}>
                  <History className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {students.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum aluno cadastrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
