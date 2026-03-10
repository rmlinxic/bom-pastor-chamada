/**
 * Página de Encerramento / Novo Ano Catequético
 * Acessível apenas por coordenadores paroquiais.
 *
 * Fluxo:
 *  1. Coordenador clica em "Novo Ano Catequético" no CoordinadorView
 *  2. Abre essa página (rota /ano-letivo)
 *  3. Passo 1 — Confirmar encerramento do ano atual
 *  4. Passo 2 — Atualizar etapa de cada catequista
 *  5. Passo 3 — Confirmar; o sistema calcula automaticamente quais alunos
 *               são aptos e quais vão para promoção manual no dashboard.
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  GraduationCap, ChevronRight, ChevronLeft, Check,
  AlertTriangle, User, ArrowRight, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

const db = supabase as any;

// Etapas fixas do programa catequético (ajuste conforme a paróquia)
const ETAPAS = [
  "Pré-Eucaristia",
  "1ª Eucaristia",
  "Pós-Eucaristia",
  "Pré-Crisma I",
  "Pré-Crisma II",
  "Crisma",
];

const MAX_FALTAS = 3; // faltas NJ + meses sem missa

type Step = 1 | 2 | 3 | 4;

interface CatequistaRow {
  id: string;
  name: string;
  etapa: string | null;
  novaEtapa: string;
}

export default function AnoLetivo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();

  const paroquiaId = user?.paroquia_id;
  const anoAtual = new Date().getFullYear();
  const [step, setStep] = useState<Step>(1);
  const [confirmText, setConfirmText] = useState("");
  const [catequistasState, setCatequistasState] = useState<CatequistaRow[]>([]);
  const [processando, setProcessando] = useState(false);

  // ---------- busca catequistas da paróquia ----------
  const { data: catequistas = [] } = useQuery({
    queryKey: ["catequistas-paroquia", paroquiaId],
    queryFn: async () => {
      const { data } = await db
        .from("catequistas")
        .select("id, name, etapa, role")
        .eq("paroquia_id", paroquiaId)
        .eq("active", true)
        .in("role", ["catequista"]);
      return (data ?? []) as { id: string; name: string; etapa: string | null; role: string }[];
    },
    enabled: !!paroquiaId && step === 2,
  });

  // Quando carrega catequistas, inicializa estado
  useMemo(() => {
    if (catequistas.length > 0 && catequistasState.length === 0) {
      setCatequistasState(
        catequistas.map((c) => ({
          id: c.id,
          name: c.name,
          etapa: c.etapa,
          novaEtapa: c.etapa ?? "",
        }))
      );
    }
  }, [catequistas]);

  // ---------- processamento principal ----------
  const processarAno = async () => {
    if (!paroquiaId) return;
    setProcessando(true);
    try {
      // 1. Busca todos os alunos ativos da paróquia
      const { data: alunos } = await db
        .from("students")
        .select("id, name, class_name, catequista_id")
        .eq("paroquia_id", paroquiaId)
        .eq("active", true);

      if (!alunos?.length) { toast({ title: "Nenhum aluno encontrado.", variant: "destructive" }); return; }

      const alunoIds = alunos.map((a: any) => a.id);

      // 2. Busca presenças (apenas do ano atual)
      const { data: presencas } = await db
        .from("attendance")
        .select("student_id, status, date")
        .in("student_id", alunoIds)
        .gte("date", `${anoAtual}-01-01`);

      // 3. Busca missas do ano
      const { data: missas } = await db
        .from("mass_attendance")
        .select("student_id, date")
        .in("student_id", alunoIds)
        .gte("date", `${anoAtual}-01-01`);

      // 4. Calcula score de faltas por aluno
      // Contagem começa no primeiro registro de presença do catequista
      const primeiroRegistro: Record<string, string> = {};
      const faltasNJ: Record<string, number> = {};
      const mesesComMissa: Record<string, Set<string>> = {};

      (presencas ?? []).forEach((p: any) => {
        if (!primeiroRegistro[p.student_id] || p.date < primeiroRegistro[p.student_id])
          primeiroRegistro[p.student_id] = p.date;
        if (p.status === "falta_nao_justificada")
          faltasNJ[p.student_id] = (faltasNJ[p.student_id] || 0) + 1;
      });

      (missas ?? []).forEach((m: any) => {
        if (!mesesComMissa[m.student_id]) mesesComMissa[m.student_id] = new Set();
        mesesComMissa[m.student_id].add(m.date.slice(0, 7));
      });

      // Meses do ano catequético (primeiro registro → hoje)
      const hoje = new Date().toISOString().slice(0, 7);
      const mesesLetivos = (studentId: string): string[] => {
        const inicio = (primeiroRegistro[studentId] ?? `${anoAtual}-01-01`).slice(0, 7);
        const result: string[] = [];
        let cur = inicio;
        while (cur <= hoje) {
          result.push(cur);
          const [y, m] = cur.split("-").map(Number);
          cur = new Date(y, m, 1).toISOString().slice(0, 7);
        }
        return result;
      };

      const scoreAluno = (studentId: string) => {
        const fnj = faltasNJ[studentId] ?? 0;
        const meses = mesesLetivos(studentId);
        const mesesSemMissa = meses.filter((m) => !(mesesComMissa[studentId] ?? new Set()).has(m)).length;
        return { fnj, mesesSemMissa, total: fnj + mesesSemMissa };
      };

      // 5. Separa: aptos (total <= MAX_FALTAS) e pendentes
      const aptos: any[] = [];
      const pendentes: any[] = [];
      alunos.forEach((a: any) => {
        const { fnj, mesesSemMissa, total } = scoreAluno(a.id);
        if (total <= MAX_FALTAS) aptos.push(a);
        else pendentes.push({ ...a, fnj, mesesSemMissa, total });
      });

      // 6. Mapa de catequista_id → nova etapa
      const novaEtapaMap: Record<string, string> = {};
      catequistasState.forEach((c) => { novaEtapaMap[c.id] = c.novaEtapa; });

      // 7. Atualiza catequistas com nova etapa
      for (const c of catequistasState) {
        if (c.novaEtapa !== c.etapa) {
          await db.from("catequistas").update({ etapa: c.novaEtapa }).eq("id", c.id);
        }
      }

      // 8. Atualiza alunos aptos: muda class_name para nova etapa do catequista
      for (const a of aptos) {
        const nova = novaEtapaMap[a.catequista_id];
        if (nova) {
          await db.from("students").update({ class_name: nova, ano_catequetico: anoAtual }).eq("id", a.id);
        }
      }

      // 9. Insere pendências de promoção manual
      if (pendentes.length > 0) {
        const rows = pendentes.map((a: any) => ({
          student_id: a.id,
          paroquia_id: paroquiaId,
          ano_catequetico: anoAtual,
          faltas_nao_justificadas: a.fnj,
          meses_sem_missa: a.mesesSemMissa,
          score_faltas: a.total,
        }));
        await db.from("promocoes_pendentes").upsert(rows, { onConflict: "student_id,ano_catequetico", ignoreDuplicates: true });
      }

      // 10. Registra ano catequético
      await db.from("anos_catequeticos").upsert(
        { paroquia_id: paroquiaId, ano: anoAtual, ativo: true },
        { onConflict: "paroquia_id,ano" }
      );

      // 11. Log
      await db.from("activity_log").insert({
        catequista_id: user!.id,
        acao: "encerramento_ano_catequetico",
        detalhes: { ano: anoAtual, aptos: aptos.length, pendentes: pendentes.length, paroquia_id: paroquiaId },
      });

      qc.invalidateQueries();
      toast({ title: `Ano ${anoAtual} processado!`, description: `${aptos.length} aluno(s) promovidos automaticamente. ${pendentes.length} aguardam decisão manual.` });
      setStep(4);
    } catch (e: any) {
      toast({ title: "Erro ao processar", description: e.message, variant: "destructive" });
    } finally {
      setProcessando(false);
    }
  };

  // ---------- render ----------
  return (
    <div className="pb-24 max-w-lg mx-auto">
      <PageHeader
        title="Novo Ano Catequético"
        subtitle={`Paróquia ${user?.paroquia_nome ?? ""} — ${anoAtual}`}
      />

      {/* Indicador de passos */}
      <div className="flex items-center justify-center gap-2 px-4 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors",
              step > s ? "bg-success border-success text-white"
              : step === s ? "bg-primary border-primary text-white"
              : "bg-muted border-border text-muted-foreground"
            )}>
              {step > s ? <Check className="h-4 w-4" /> : s}
            </div>
            {s < 3 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* ===== PASSO 1: confirmar encerramento ===== */}
      {step === 1 && (
        <div className="px-4 space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="font-bold text-destructive">Ação irreversível</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Ao prosseguir, o sistema irá:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground list-disc list-inside">
              <li>Calcular a frequência de cada aluno no ano {anoAtual}</li>
              <li>Promover automaticamente os alunos aptos ({'≤'}{MAX_FALTAS} faltas + meses sem missa)</li>
              <li>Criar uma fila de decisão manual para os demais</li>
              <li>Permitir que você atualize a etapa de cada catequista</li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Digite <strong>CONFIRMAR</strong> para continuar:</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="CONFIRMAR"
              className="font-mono"
            />
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => navigate("/coordenador")}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={confirmText !== "CONFIRMAR"}
              onClick={() => { setStep(2); setCatequistasState([]); }}
            >
              Continuar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== PASSO 2: atualizar etapas dos catequistas ===== */}
      {step === 2 && (
        <div className="px-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Defina a <strong>nova etapa</strong> de cada catequista para o próximo ano. Os alunos aptos serão vinculados automaticamente.
          </p>

          {catequistasState.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando catequistas...
            </div>
          )}

          <div className="space-y-3">
            {catequistasState.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    Atual: <span className="font-medium text-foreground">{c.etapa ?? "—"}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <select
                    value={c.novaEtapa}
                    onChange={(e) => setCatequistasState((prev) =>
                      prev.map((x, j) => j === i ? { ...x, novaEtapa: e.target.value } : x)
                    )}
                    className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— Selecione a nova etapa —</option>
                    {ETAPAS.map((e) => <option key={e} value={e}>{e}</option>)}
                    <option value={c.novaEtapa ?? ""}>{c.novaEtapa && !ETAPAS.includes(c.novaEtapa) ? c.novaEtapa : ""}</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <Button
              className="flex-1"
              disabled={catequistasState.some((c) => !c.novaEtapa)}
              onClick={() => setStep(3)}
            >
              Revisar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* ===== PASSO 3: revisão e confirmação final ===== */}
      {step === 3 && (
        <div className="px-4 space-y-4">
          <p className="text-sm text-muted-foreground">Revise as mudanças antes de confirmar:</p>

          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <p className="text-xs font-bold uppercase text-muted-foreground tracking-wide mb-1">Etapas dos catequistas</p>
            {catequistasState.map((c) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 font-medium">{c.name}</span>
                <span className="text-muted-foreground text-xs">{c.etapa ?? "—"}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={cn("text-xs font-bold", c.novaEtapa !== c.etapa ? "text-primary" : "text-muted-foreground")}>
                  {c.novaEtapa}
                </span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3">
            <p className="text-xs text-warning">
              <strong>Regra de promoção automática:</strong> alunos com até {MAX_FALTAS} faltas não justificadas
              + meses sem missa são promovidos automaticamente. Os demais entram na fila de decisão manual no seu dashboard.
            </p>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(2)} disabled={processando}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
            <Button className="flex-1" onClick={processarAno} disabled={processando}>
              {processando ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Processando...</> : <><GraduationCap className="h-4 w-4 mr-1.5" /> Confirmar</>}
            </Button>
          </div>
        </div>
      )}

      {/* ===== PASSO 4: sucesso ===== */}
      {step === 4 && (
        <div className="px-4 space-y-4 text-center">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
              <GraduationCap className="h-8 w-8 text-success" />
            </div>
          </div>
          <p className="text-lg font-bold text-foreground">Ano processado com sucesso!</p>
          <p className="text-sm text-muted-foreground">
            Alunos aptos foram promovidos. Verifique o seu dashboard para as decisões manuais pendentes.
          </p>
          <Button className="w-full" onClick={() => navigate("/coordenador")}>
            Voltar ao painel
          </Button>
        </div>
      )}
    </div>
  );
}
