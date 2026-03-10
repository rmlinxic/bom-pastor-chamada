import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { GraduationCap, AlertTriangle, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ETAPAS, nomeTurma, parseTurma, proximaEtapa } from "@/lib/etapas";

const db = supabase as any;

type Catequista = {
  id: string;
  name: string;
  etapa: string | null;       // etapa atual (ex: "Primeira Etapa A")
  novaEtapa: string;          // etapa base selecionada (ex: "Segunda Etapa")
  novaTurma: string;          // sufixo selecionado (ex: "A" ou "")
};

export default function AnoLetivo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const paroquiaId = user?.paroquia_id;
  const anoAtual = new Date().getFullYear();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [confirmText, setConfirmText] = useState("");
  const [catequistas, setCatequistas] = useState<Catequista[]>([]);
  const [processing, setProcessing] = useState(false);

  const { data: catRaw = [], isLoading: loadingCat } = useQuery({
    queryKey: ["catequistas-paroquia", paroquiaId],
    queryFn: async () => {
      const { data } = await db
        .from("catequistas")
        .select("id, name, etapa")
        .eq("paroquia_id", paroquiaId)
        .eq("active", true)
        .in("role", ["catequista", "coordenador_catequista"]);
      return (data ?? []) as { id: string; name: string; etapa: string | null }[];
    },
    enabled: !!paroquiaId,
    onSuccess: (data) => {
      setCatequistas(
        data.map((c) => {
          const { etapa: etapaBase } = parseTurma(c.etapa ?? "");
          const proxima = proximaEtapa(c.etapa ?? "");
          const { etapa: proximaBase, turma: proximaTurma } = parseTurma(proxima);
          return {
            ...c,
            novaEtapa: proximaBase || ETAPAS[0],
            novaTurma: proximaTurma,
          };
        })
      );
    },
  });

  const allEtapasSet = useMemo(
    () => catequistas.every((c) => !!c.novaEtapa),
    [catequistas]
  );

  const processarAno = useMutation({
    mutationFn: async () => {
      setProcessing(true);

      const { data: students } = await db
        .from("students")
        .select("id, class_name, catequista_id")
        .eq("paroquia_id", paroquiaId)
        .eq("active", true);

      const allStudents = (students ?? []) as { id: string; class_name: string; catequista_id: string | null }[];

      const aptos: { id: string; novaEtapa: string }[] = [];
      const pendentes: {
        student_id: string;
        faltas_nao_justificadas: number;
        meses_sem_missa: number;
        score_faltas: number;
      }[] = [];

      for (const student of allStudents) {
        const { data: firstRec } = await db
          .from("attendance")
          .select("date")
          .eq("student_id", student.id)
          .order("date", { ascending: true })
          .limit(1)
          .maybeSingle();

        const since = firstRec?.date ?? null;
        let faltasNJ = 0;
        if (since) {
          const { count } = await db
            .from("attendance")
            .select("id", { count: "exact" })
            .eq("student_id", student.id)
            .eq("status", "falta_nao_justificada")
            .gte("date", since);
          faltasNJ = count ?? 0;
        }

        let mesesSemMissa = 0;
        if (since) {
          const sinceDate = new Date(since);
          const hoje = new Date();
          const cur = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
          while (cur <= hoje) {
            const mes = cur.toISOString().slice(0, 7);
            const [y, m] = mes.split("-").map(Number);
            const end = new Date(y, m, 0).toISOString().slice(0, 10);
            const { count } = await db
              .from("mass_attendance")
              .select("id", { count: "exact" })
              .eq("student_id", student.id)
              .gte("date", `${mes}-01`)
              .lte("date", end);
            if ((count ?? 0) === 0) mesesSemMissa++;
            cur.setMonth(cur.getMonth() + 1);
          }
        }

        const score = faltasNJ + mesesSemMissa;
        const cat = catequistas.find((c) => c.id === student.catequista_id);
        const novaEtapa = cat ? nomeTurma(cat.novaEtapa, cat.novaTurma || undefined) : proximaEtapa(student.class_name);

        if (score <= 3) {
          aptos.push({ id: student.id, novaEtapa });
        } else {
          pendentes.push({
            student_id: student.id,
            faltas_nao_justificadas: faltasNJ,
            meses_sem_missa: mesesSemMissa,
            score_faltas: score,
          });
        }
      }

      for (const { id, novaEtapa } of aptos) {
        await db.from("students").update({ class_name: novaEtapa, ano_catequetico: anoAtual }).eq("id", id);
      }

      if (pendentes.length > 0) {
        await db.from("promocoes_pendentes").upsert(
          pendentes.map((p) => ({ ...p, paroquia_id: paroquiaId, ano_catequetico: anoAtual })),
          { onConflict: "student_id,ano_catequetico" }
        );
      }

      for (const cat of catequistas) {
        const novaEtapaFinal = nomeTurma(cat.novaEtapa, cat.novaTurma || undefined);
        await db.from("catequistas").update({ etapa: novaEtapaFinal }).eq("id", cat.id);
      }

      await db.from("anos_catequeticos").upsert(
        { paroquia_id: paroquiaId, ano: anoAtual, encerrado_em: new Date().toISOString(), ativo: false },
        { onConflict: "paroquia_id,ano" }
      );

      await db.from("activity_log").insert({
        catequista_id: user!.id,
        acao: "encerramento_ano",
        detalhes: { ano: anoAtual, aptos: aptos.length, pendentes: pendentes.length, paroquia_id: paroquiaId },
      });

      return { aptos: aptos.length, pendentes: pendentes.length };
    },
    onSuccess: ({ aptos, pendentes }) => {
      setProcessing(false);
      qc.invalidateQueries({ queryKey: ["students"] });
      qc.invalidateQueries({ queryKey: ["promocoes-pendentes"] });
      toast({
        title: "Ano encerrado com sucesso!",
        description: `${aptos} aluno(s) promovido(s). ${pendentes} aguardando decisão manual.`,
      });
      navigate("/coordenador");
    },
    onError: () => {
      setProcessing(false);
      toast({ title: "Erro ao processar o ano. Tente novamente.", variant: "destructive" });
    },
  });

  return (
    <div className="pb-24">
      <PageHeader title="Encerramento de Ano" subtitle={`Ano Catequético ${anoAtual}`} />

      <div className="px-4 space-y-4">
        {/* Indicador de passos */}
        <div className="flex items-center gap-2 justify-center py-2">
          {([1, 2, 3] as const).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                step === s ? "border-primary bg-primary text-white" :
                step > s ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground"
              }`}>{step > s ? "✓" : s}</div>
              {s < 3 && <div className={`w-8 h-0.5 ${step > s ? "bg-success" : "bg-border"}`} />}
            </div>
          ))}
        </div>

        {/* PASSO 1 */}
        {step === 1 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <span className="font-bold text-destructive">Ação Irreversível</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
              <li>Alunos aptos serão promovidos automaticamente</li>
              <li>Alunos com mais de 3 faltas entrarão em fila de decisão manual</li>
              <li>As etapas de todos os catequistas serão atualizadas</li>
              <li>O processo não pode ser desfeito</li>
            </ul>
            <div className="space-y-2">
              <p className="text-sm font-medium">Digite <strong>CONFIRMAR</strong> para prosseguir:</p>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                placeholder="CONFIRMAR" className="font-mono" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/coordenador")}>Cancelar</Button>
              <Button className="flex-1" disabled={confirmText !== "CONFIRMAR"} onClick={() => setStep(2)}>
                Prosseguir <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* PASSO 2 — Etapas dos catequistas */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="h-5 w-5 text-primary" />
                <span className="font-bold">Nova etapa de cada catequista</span>
              </div>
              {loadingCat ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : catequistas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum catequista ativo encontrado.</p>
              ) : (
                <div className="space-y-4">
                  {catequistas.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold">{c.name}</p>
                        <span className="text-xs text-muted-foreground">{c.etapa ?? "sem etapa"}</span>
                      </div>
                      {/* Select de etapa */}
                      <Select value={c.novaEtapa}
                        onValueChange={(v) => setCatequistas((prev) =>
                          prev.map((x) => x.id === c.id ? { ...x, novaEtapa: v, novaTurma: "" } : x)
                        )}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ETAPAS.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {/* Select de turma */}
                      <Select value={c.novaTurma || "__none__"}
                        onValueChange={(v) => setCatequistas((prev) =>
                          prev.map((x) => x.id === c.id ? { ...x, novaTurma: v === "__none__" ? "" : v } : x)
                        )}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sem subturma</SelectItem>
                          {["A","B","C","D","E","F","G","H"].map((l) => (
                            <SelectItem key={l} value={l}>Turma {l}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-primary font-medium">
                        Turma final: <strong>{nomeTurma(c.novaEtapa, c.novaTurma || undefined)}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Voltar</Button>
              <Button className="flex-1" disabled={!allEtapasSet || catequistas.length === 0} onClick={() => setStep(3)}>
                Revisar <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* PASSO 3 — Revisão */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="font-bold">Confirmar mudanças de etapa</span>
              </div>
              <div className="space-y-2">
                {catequistas.map((c) => {
                  const nova = nomeTurma(c.novaEtapa, c.novaTurma || undefined);
                  return (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <span className="flex-1 font-medium truncate">{c.name}</span>
                      <span className="text-muted-foreground text-xs shrink-0">{c.etapa ?? "—"}</span>
                      {nova !== c.etapa ? (
                        <>
                          <ArrowRight className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-primary font-semibold text-xs shrink-0">{nova}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground text-xs">(sem mudança)</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)} disabled={processing}>Voltar</Button>
              <Button className="flex-1" onClick={() => processarAno.mutate()} disabled={processing}>
                {processing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</> : "Confirmar e Encerrar Ano"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
