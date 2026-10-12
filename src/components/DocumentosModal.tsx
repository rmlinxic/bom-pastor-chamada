import { useEffect, useState } from "react";
import { FileCheck, FileX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
  const { data: saved, isLoading, isError } = useDocumentosStudent(student.id);
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="z-[60] flex max-h-[calc(100dvh-2rem)] max-w-sm flex-col gap-0 overflow-hidden p-0">
        {/* Header */}
        <DialogHeader className="shrink-0 border-b border-border p-4 pr-10 text-left"><DialogTitle>{student.name}</DialogTitle><DialogDescription>{student.class_name}</DialogDescription></DialogHeader>

        {/* Body */}
        <div className="min-h-0 overflow-y-auto p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Documentos Necessários
          </p>

          {isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar os documentos. Feche e tente novamente.</p> : isLoading ? (
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

          {allDone && !isLoading && !isError && (
            <p className="mt-3 text-center text-xs text-green-600 dark:text-green-400 font-semibold">
              ✓ Todos os documentos entregues!
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="safe-bottom shrink-0 border-t border-border p-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={handleSave}
            disabled={saveMutation.isPending || isLoading || isError}
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
