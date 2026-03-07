import { useState, useRef } from "react";
import { UserPlus, Pencil, History, ArrowLeft, Trash2, Upload, FileDown } from "lucide-react";
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
  useImportStudents,
} from "@/hooks/useStudents";
import { toast } from "sonner";

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

// ---------------------------------------------------------------------------
// Parser de CSV
// Detecta separador automático (vírgula ou ponto e vírgula)
// Colunas aceitas (case-insensitive): Nome, Turma, Responsavel, Telefone
// ---------------------------------------------------------------------------
function parseStudentsCSV(raw: string): {
  name: string;
  class_name: string;
  parent_name: string;
  phone: string;
}[] {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("O arquivo está vazio ou não tem dados.");

  // Detectar separador pela primeira linha
  const firstLine = lines[0];
  const sep = (firstLine.match(/;/g) ?? []).length >= (firstLine.match(/,/g) ?? []).length ? ";" : ",";

  const splitLine = (line: string) =>
    line.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, "").trim());

  const headers = splitLine(firstLine).map((h) => h.toLowerCase());

  // Mapeamento flexível de colunas
  const ALIASES: Record<string, string> = {
    nome: "name", name: "name",
    turma: "class_name", class: "class_name", classe: "class_name", "class_name": "class_name",
    responsavel: "parent_name", "responsável": "parent_name",
    parent: "parent_name", "parent_name": "parent_name",
    mae: "parent_name", mãe: "parent_name", pai: "parent_name",
    telefone: "phone", phone: "phone", tel: "phone", celular: "phone", fone: "phone",
  };

  const idx = (field: string) =>
    headers.findIndex((h) => ALIASES[h] === field);

  const nameIdx = idx("name");
  const classIdx = idx("class_name");
  const parentIdx = idx("parent_name");
  const phoneIdx = idx("phone");

  if (nameIdx === -1) throw new Error('Coluna "Nome" não encontrada. Verifique o cabeçalho do CSV.');
  if (classIdx === -1) throw new Error('Coluna "Turma" não encontrada. Verifique o cabeçalho do CSV.');

  const students = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    const name = cols[nameIdx] ?? "";
    const class_name = cols[classIdx] ?? "";
    if (!name || !class_name) continue; // pular linhas incompletas
    students.push({
      name,
      class_name,
      parent_name: parentIdx >= 0 ? (cols[parentIdx] ?? "") : "",
      phone: phoneIdx >= 0 ? (cols[phoneIdx] ?? "") : "",
    });
  }

  if (students.length === 0)
    throw new Error("Nenhum aluno válido encontrado no arquivo.");

  return students;
}

// Gera e faz download do modelo CSV
function downloadTemplate() {
  const rows = [
    ["Nome", "Turma", "Responsavel", "Telefone"],
    ["João Silva", "Crisma 2025", "Maria Silva", "(41) 99999-0001"],
    ["Ana Souza", "Crisma 2025", "Carlos Souza", "(41) 99999-0002"],
    ["Pedro Lima", "Crisma 2026", "Fátima Lima", "(41) 99999-0003"],
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo-alunos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------

export default function Students() {
  const { data: students = [] } = useStudents();
  const addMutation = useAddStudent();
  const updateMutation = useUpdateStudent();
  const deleteMutation = useDeleteStudent();
  const importMutation = useImportStudents();

  const [open, setOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [historyStudentId, setHistoryStudentId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<string>("all");
  const { data: history = [] } = useStudentAttendanceHistory(historyStudentId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = { name: "", class_name: "", parent_name: "", phone: "" };
  const [form, setForm] = useState(emptyForm);

  const openAdd = () => {
    setEditingStudent(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (s: (typeof students)[0]) => {
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

  // Leitura do arquivo CSV
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = ""; // permite reimportar o mesmo arquivo
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = parseStudentsCSV(text);

        if (
          window.confirm(
            `${parsed.length} aluno(s) encontrado(s) no arquivo.\n\nDeseja importar todos?`
          )
        ) {
          importMutation.mutate(parsed);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Erro ao ler o arquivo.";
        toast.error(msg);
      }
    };
    reader.readAsText(file, "UTF-8");
  };

  const isPending = addMutation.isPending || updateMutation.isPending;

  const classes = [
    "all",
    ...Array.from(new Set(students.map((s) => s.class_name))).sort(),
  ];

  const filteredStudents =
    selectedClass === "all"
      ? students
      : students.filter((s) => s.class_name === selectedClass);

  // Sub-view: histórico do aluno
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
              <span className={cn("text-sm font-semibold", statusColors[h.status])}>
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

      {/* Ações principais */}
      <div className="px-4 mb-4 space-y-2">
        {/* Adicionar aluno manual */}
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
                  onChange={(e) => setForm({ ...form, class_name: e.target.value })}
                  placeholder="Ex: Crisma 2025"
                  required
                />
              </div>
              <div>
                <Label htmlFor="parent_name">Nome do Responsável</Label>
                <Input
                  id="parent_name"
                  value={form.parent_name}
                  onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="(99) 99999-9999"
                />
              </div>
              <Button type="submit" className="w-full h-12" disabled={isPending}>
                {isPending
                  ? "Salvando..."
                  : editingStudent
                  ? "Atualizar"
                  : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Importar / Baixar modelo */}
        <div className="flex gap-2">
          {/* Input oculto para seleção de arquivo */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
          >
            <Upload className="mr-2 h-4 w-4" />
            {importMutation.isPending ? "Importando..." : "Importar CSV"}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={downloadTemplate}
            title="Baixar planilha modelo para preencher e importar"
          >
            <FileDown className="mr-2 h-4 w-4" />
            Modelo
          </Button>
        </div>

        {/* Instruções rápidas */}
        <p className="text-xs text-muted-foreground text-center">
          CSV aceita colunas: <strong>Nome</strong>, <strong>Turma</strong>,
          Responsavel, Telefone — separador por vírgula ou ponto e vírgula
        </p>
      </div>

      {/* Filtro por turma */}
      {classes.length > 2 && (
        <div className="px-4 mb-4 flex gap-2 overflow-x-auto pb-1">
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

      {/* Lista de alunos */}
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
            Nenhum aluno cadastrado ainda.{" "}
            <br />
            Cadastre manualmente ou importe um CSV.
          </p>
        )}
      </div>
    </div>
  );
}
