import { ClipboardList, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { usePendingCenter } from "@/hooks/usePendingCenter";
import type { PendingScope } from "@/lib/pending-center";
import { localDateString } from "@/lib/dates";

export default function PendingCenterSummary({ scope }: { scope: PendingScope }) {
  const { data, isPending, isError } = usePendingCenter(localDateString(), scope);
  const params = new URLSearchParams();
  if (scope.kind === "own") params.set("own", "1");
  if (scope.kind === "paroquia" || scope.kind === "etapa") {
    if (scope.paroquia_id) params.set("paroquia", scope.paroquia_id);
  }
  if (scope.kind === "etapa") params.set("turma", scope.etapa);
  const count = data ? data.attendanceGroups.length + data.justifications.length + data.documents.length + data.promotions.length : 0;
  return (
    <Link to={`/pendencias${params.size ? `?${params}` : ""}`} className="surface-card mx-4 mb-5 flex items-center gap-3 rounded-xl p-4 transition-colors hover:border-primary sm:mx-6">
      <ClipboardList className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">Central de pendências</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isError ? "Abra a central para tentar carregar novamente." : isPending ? "Consultando pendências..." : `${count} ${count === 1 ? "item para conferir" : "itens para conferir"}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Chamadas, justificativas, documentos e decisões do ano letivo.</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
    </Link>
  );
}
