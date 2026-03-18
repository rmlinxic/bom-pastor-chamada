import { useEffect, useState } from "react";
import { X, FileCheck, FileX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentosStudent, useSaveDocumentos } from "@/hooks/useDocumentos";

// Documentos exigidos por etapa
const DOCS_QUARTA_ETAPA = [
  { key: "batismo" as const,  label: "Comprovante de Batismo" },
  { key: "endereco" as const, label: "Comprovante de Endereço" },
] as const;

const DOCS_CRISMA = [
  { key: "batismo" as const,           label: "Comprovante de Batismo" },
  { key: "endereco" as const,          label: "Comprovante de Endereço" },
  { key: "crisma_padrinho" as const,   label: "Comprovante de Crisma do Padrinho" },
  { key: "primeira_comunhao" as const, label: "Comprovante de Primeira Comunhão" },
] as const;

type DocKey = "batismo" | "endereco" | "crisma_padrinho" | "primeira_comunhao";

type Props = {
  student: { id: string; name: string; class_name: string };
  onClose: () => void;
};

function resolveDocList(className: string) {
  const c = className.toLowerCase();
  if (c.includes("crisma")) return DOCS_CRISMA;
  return DOCS_QUARTA_ETAPA;
}

export default function DocumentosModal({ student, onClose }: Props) {
  const { data: saved, isLoading } = useDocumentosStudent(student.id);
  const saveMutation = useSaveDocumentos();
  const docs = resolveDocList(student.class_name);

  const [checked, setChecked] = useState<Record<DocKey, boolean>>({
    batismo: false,
    endereco: false,
    crisma_padrinho: false,
    primeira_comunhao: false,
  });

  useEffect(() => {
    if (saved) {
      setChecked({
        batismo: saved.batismo,
        endereco: saved.endereco,
        crisma_padrinho: saved.crisma_padrinho,
        primeira_comunhao: saved.primeira_comunhao,
      });
    }
  }, [saved]);

  const toggle = (key: DocKey) =>
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = () => {
    saveMutation.mutate(
      { student_id: student.id, ...checked },
      { onSuccess: onClose }
    );
  };

  const allDone = docs.every((d) => checked[d.key]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-xl bg-background shadow-xl border border-border animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <p className="font-semibold text-foreground">{student.name}</p>
            <p className="text-xs text-muted-foreground">{student.class_name}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Documentos Necessários
          </p>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => {
                const isChecked = checked[doc.key];
                return (
                  <button
                    key={doc.key}
                    onClick={() => toggle(doc.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                      isChecked
                        ? "border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-400"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"
                    }`}
                  >
                    {isChecked ? (
                      <FileCheck className="h-5 w-5 shrink-0" />
                    ) : (
                      <FileX className="h-5 w-5 shrink-0" />
                    )}
                    <span className="text-sm font-medium">{doc.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {allDone && (
            <p className="mt-3 text-center text-xs text-green-600 dark:text-green-400 font-semibold">
              ✓ Todos os documentos entregues!
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
