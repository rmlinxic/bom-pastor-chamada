import { useState, useRef } from "react";
import {
  Plus, Search, Edit, Trash2, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, Clock, Upload, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/PageHeader";
import { useStudents, useDeleteStudent, useImportStudents } from "@/hooks/useStudents";
import { useAllAttendance } from "@/hooks/useAttendance";
import StudentForm from "@/components/StudentForm";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const STATUS_ICON: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  presente: { icon: CheckCircle, color: "text-success", label: "P" },
  falta_nao_justificada: { icon: XCircle, color: "text-destructive", label: "FN" },
  falta_justificada: { icon: AlertTriangle, color: "text-warning", label: "FJ" },
};

const CSV_TEMPLATE =
  "nome,turma,responsavel,telefone\n" +
  "Maria da Silva,1º Ano Eucaristia,Ana da Silva,(41) 99999-1234\n" +
  "Jo\u00e3o Santos,2º Ano Crisma,Carlos Santos,(41) 98888-5678\n";

function downloadCSVTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "modelo_catequizandos.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function Students() {
  const { data: students = [], isLoading } = useStudents();
  const { data: attendance = [] } = useAllAttendance();
  const deleteMutation = useDeleteStudent();
  const importMutation = useImportStudents();

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const filtered = students.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.class_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Remover catequizando "${name}"? Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita.`))
      deleteMutation.mutate(id);
  };

  const handleEdit = (student: any) => {
    setEditingStudent(student);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingStudent(null);
  };

  const handleCSVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) {
        toast.error("CSV vazio ou sem dados.");
        return;
      }
      const header = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/["']/g, ""));
      const nameIdx = header.findIndex((h) => h === "nome" || h === "name");
      const classIdx = header.findIndex((h) => h === "turma" || h === "class_name");
      const parentIdx = header.findIndex((h) => h === "responsavel" || h === "parent_name");
      const phoneIdx = header.findIndex((h) => h === "telefone" || h === "phone");

      if (nameIdx === -1) {
        toast.error('CSV precisa ter coluna "nome" ou "name".');
        return;
      }

      const records = lines.slice(1).map((line) => {
        const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
        return {
          name: cols[nameIdx] ?? "",
          class_name: classIdx !== -1 ? (cols[classIdx] ?? "") : "",
          parent_name: parentIdx !== -1 ? (cols[parentIdx] ?? "") : "",
          phone: phoneIdx !== -1 ? (cols[phoneIdx] ?? "") : "",
        };
      }).filter((r) => r.name.length > 0);

      if (records.length === 0) {
        toast.error("Nenhum catequizando v\u00e1lido encontrado no CSV.");
        return;
      }

      importMutation.mutate(records);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const historyByStudent = (studentId: string) =>
    attendance
      .filter((a) => a.student_id === studentId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);

  const toggleExpand = (id: string) =>
    setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="pb-24">
      <PageHeader title="Catequizandos" subtitle="Gerencie os catequizandos" />

      <div className="px-4 mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou turma..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Baixar modelo CSV */}
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Baixar modelo CSV"
          onClick={downloadCSVTemplate}
        >
          <Download className="h-5 w-5" />
        </Button>

        {/* Importar CSV */}
        <Button
          variant="outline"
          size="icon"
          className="shrink-0"
          title="Importar via CSV"
          onClick={() => csvInputRef.current?.click()}
          disabled={importMutation.isPending}
        >
          <Upload className="h-5 w-5" />
        </Button>
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleCSVChange}
        />

        <Button onClick={() => setShowForm(true)} size="icon" className="shrink-0">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      {/* Legenda dos botões de CSV */}
      <div className="px-4 mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Download className="h-3 w-3" /> Baixar modelo
        </span>
        <span className="flex items-center gap-1">
          <Upload className="h-3 w-3" /> Importar CSV
        </span>
      </div>

      {isLoading && (
        <div className="px-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      )}

      <div className="px-4 space-y-2">
        {filtered.map((student) => {
          const history = historyByStudent(student.id);
          const isOpen = expandedId === student.id;
          const presentCount = history.filter((h) => h.status === "presente").length;
          const totalCount = history.length;
          const pct = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : null;
          const unjustifiedCount = history.filter((h) => h.status === "falta_nao_justificada").length;

          return (
            <div
              key={student.id}
              className={cn(
                "rounded-lg border border-border bg-card shadow-sm overflow-hidden transition-all",
                unjustifiedCount >= 2 && "border-destructive/40"
              )}
            >
              <div className="flex items-center justify-between p-4 gap-3">
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => toggleExpand(student.id)}
                >
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground truncate">{student.name}</p>
                    {unjustifiedCount >= 2 && (
                      <span className="shrink-0 text-[10px] font-bold rounded-full bg-destructive/15 text-destructive px-1.5 py-0.5">
                        {unjustifiedCount} FN
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">{student.class_name}</p>
                    {pct !== null && (
                      <span className={cn(
                        "text-[10px] font-semibold rounded-full px-1.5 py-0.5",
                        pct >= 75 ? "bg-success/15 text-success" :
                        pct >= 50 ? "bg-warning/15 text-warning" :
                        "bg-destructive/15 text-destructive"
                      )}>
                        {pct}% presen\u00e7a
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleExpand(student.id)}
                    className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    title="Ver hist\u00f3rico"
                  >
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleEdit(student)}
                    className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(student.id, student.name)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-border bg-muted/30 px-4 py-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Hist\u00f3rico recente
                    {totalCount > 0 && (
                      <span className="ml-2 font-normal normal-case">
                        {presentCount}/{totalCount} presen\u00e7as ({pct}%)
                      </span>
                    )}
                  </p>
                  {history.length === 0 ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <p className="text-sm">Nenhum registro ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {history.map((rec) => {
                        const cfg = STATUS_ICON[rec.status] ?? { icon: Clock, color: "text-muted-foreground", label: "?" };
                        const Icon = cfg.icon;
                        return (
                          <div key={rec.id} className="flex items-center gap-2.5 text-sm">
                            <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />
                            <span className="text-muted-foreground w-24 shrink-0">
                              {format(parseISO(rec.date), "dd MMM yyyy", { locale: ptBR })}
                            </span>
                            <span className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</span>
                            {(rec as any).justification_reason && (
                              <span className="text-xs text-muted-foreground italic truncate">{(rec as any).justification_reason}</span>
                            )}
                          </div>
                        );
                      })}
                      {attendance.filter((a) => a.student_id === student.id).length > 20 && (
                        <p className="text-xs text-muted-foreground mt-1">Mostrando os 20 registros mais recentes.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && !isLoading && (
          <div className="py-10 text-center">
            <p className="text-muted-foreground">Nenhum catequizando encontrado.</p>
          </div>
        )}
      </div>

      {showForm && (
        <StudentForm
          student={editingStudent}
          onClose={handleCloseForm}
        />
      )}
    </div>
  );
}
