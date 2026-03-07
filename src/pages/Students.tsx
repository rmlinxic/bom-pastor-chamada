import { useState } from "react";
import { UserPlus, Pencil, History, ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import {
  useStudents,
  useAddStudent,
  useUpdateStudent,
  useDeleteStudent,
  useStudentAttendanceHistory,
} from "@/hooks/useStudents";

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
  const deleteMutation = useDeleteStudent();
  const [open, setOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("all");
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
    setForm({
      name: s.name,
      class_name: s.class_name,
      parent_name: s.parent_name,
      phone: s.phone,
    });
    setOpen(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (
      window.confirm(
        `Deseja remover o aluno "${name}"?\nO histórico de presença será preservado.`
      )
    ) {
      deleteMutation.mutate(id);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.class_name.trim()) return;
    if (editingStudent) {
      updateMutation.mutate(
        { id: editingStudent, ...form },
        {
          onSuccess: () => {
            setOpen(false);
            setForm(emptyForm);
            setEditingStudent(null);
          },
        }
      );
    } else {
      addMutation.mutate(form, {
        onSuccess: () => {
          setOpen(false);
          setForm(emptyForm);
        },
      });
    }
  };

  const isPending = addMutation.isPending || updateMutation.isPending;

  // Get unique sorted class names for filter tabs
  const classes = [
    "all",
    ...Array.from(new Set(students.map((s) => s.class_name))).sort(),
  ];

  const filteredStudents =
    selectedClass === "all"
      ? students
      : students.filter((s) => s.class_name === selectedClass);

  // History sub-view
  if (historyStudentId) {
    const student = students.find((s) => s.id === historyStudentId);
    return (
      <div className="pb-24">
        <div className="px-4 pt-6 pb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setHistoryStudentId(null)}
            className="mb-2 -ml-2"
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{student?.name}</h1>
          <p className="text-sm text-muted-foreground">Histórico de presença</p>
        </div>
        <div className="px-4 space-y-2">
          {history.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <span className="text-sm font-medium text-foreground">{h.date}</span>
              <span
                className={cn(
                  "text-sm font-semibold",
                  statusColors[h.status]
                )}
              >
                {statusLabels[h.status] ?? h.status}
              </span>
            </div>
          ))}
          {history.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              Nenhum registro encontrado.
            </p>
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
            <Button
              className="w-full h-12 text-base font-semibold"
              onClick={openAdd}
            >
              <UserPlus className="mr-2 h-5 w-5" />
              Novo Aluno
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {editingStudent ? "Editar Aluno" : "Cadastrar Aluno"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Aluno</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="class_name">Turma</Label>
                <Input
                  id="class_name"
                  value={form.class_name}
                  onChange={(e) =>
                    setForm({ ...form, class_name: e.target.value })
                  }
                  placeholder="Ex: Crisma 2025"
                  required
                />
              </div>
              <div>
                <Label htmlFor="parent_name">Nome do Responsável</Label>
                <Input
                  id="parent_name"
                  value={form.parent_name}
                  onChange={(e) =>
                    setForm({ ...form, parent_name: e.target.value })
                  }
                  required
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(99) 99999-9999"
                  required
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12"
                disabled={isPending}
              >
                {isPending
                  ? "Salvando..."
                  : editingStudent
                  ? "Atualizar"
                  : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Class filter tabs — only show when there are multiple classes */}
      {classes.length > 2 && (
        <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {classes.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedClass(c)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                selectedClass === c
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {c === "all" ? "Todas as turmas" : c}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2 px-4">
        {filteredStudents.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-border bg-card p-4 shadow-sm animate-fade-in"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0 pr-2">
                <p className="font-semibold text-foreground truncate">{s.name}</p>
                <p className="text-sm text-primary font-medium">{s.class_name}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Resp: {s.parent_name}</span>
                  <span>{s.phone}</span>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  title="Editar"
                  onClick={() => openEdit(s)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Histórico"
                  onClick={() => setHistoryStudentId(s.id)}
                >
                  <History className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remover"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(s.id, s.name)}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}

        {filteredStudents.length === 0 && students.length > 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum aluno encontrado para essa turma.
          </p>
        )}
        {students.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum aluno cadastrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
