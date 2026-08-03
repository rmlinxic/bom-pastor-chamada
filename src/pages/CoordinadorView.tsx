import { useState, useMemo } from "react";
import {
  Users, BarChart2, GraduationCap, CheckCircle, XCircle,
  Clock, AlertTriangle, ChevronDown, ChevronUp, Loader2,
  UserPlus, Eye, EyeOff, BookOpen, Mail,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { proximaEtapa, ETAPAS, nomeTurma } from "@/lib/etapas";
import { useCreateCatequista, useCatequistasByParoquia } from "@/hooks/useCatequistas";

const db = supabase as any;

export default function CoordinadorView() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const paroquiaId = user?.paroquia_id;
  const anoAtual = new Date().getFullYear();

  // ---------- stats gerais ----------
  const { data: stats } = useQuery({
    queryKey: ["coord-stats", paroquiaId],
    queryFn: async () => {
      const [studRes, attRes, catRes] = await Promise.all([
        db.from("students").select("id", { count: "exact" }).eq("paroquia_id", paroquiaId).eq("active", true),
        db.from("attendance").select("status").in(
          "student_id",
          (await db.from("students").select("id").eq("paroquia_id", paroquiaId).eq("active", true)).data?.map((s: any) => s.id) ?? []
        ),
        db.from("catequistas").select("id, name, etapa", { count: "exact" }).eq("paroquia_id", paroquiaId).eq("active", true).eq("role", "catequista"),
      ]);
      const total = studRes.count ?? 0;
      const att = attRes.data ?? [];
      const present = att.filter((a: any) => a.status === "presente").length;
      const absent = att.filter((a: any) => a.status === "falta_nao_justificada").length;
      return { total, present, absent, catequistas: catRes.data ?? [], totalCat: catRes.count ?? 0 };
    },
    enabled: !!paroquiaId,
  });

  // ---------- promoções manuais pendentes ----------
  const { data: pendentes = [], isLoading: loadingPendentes } = useQuery({
    queryKey: ["promocoes-pendentes", paroquiaId, anoAtual],
    queryFn: async () => {
      const { data } = await db
        .from("promocoes_pendentes")
        .select("id, student_id, faltas_nao_justificadas, meses_sem_missa, score_faltas, decisao, students(name, class_name, catequista_id, catequistas(etapa))")
        .eq("paroquia_id", paroquiaId)
        .eq("ano_catequetico", anoAtual)
        .is("decisao", null);
      return (data ?? []) as any[];
    },
    enabled: !!paroquiaId,
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ id, studentId, decisao, etapaAtual, catequistaEtapa }: {
      id: string;
      studentId: string;
      decisao: "promovido" | "retido";
      etapaAtual: string;
      catequistaEtapa: string | null;
    }) => {
      // 1. Grava decisão
      await db.from("promocoes_pendentes").update({
        decisao,
        decidido_por: user!.id,
        decidido_em: new Date().toISOString(),
      }).eq("id", id);

      // 2. Se promovido: atualiza class_name do aluno para a etapa do catequista (próxima etapa)
      if (decisao === "promovido") {
        const novaEtapa = catequistaEtapa ?? proximaEtapa(etapaAtual);
        await db.from("students").update({ class_name: novaEtapa }).eq("id", studentId);
      }

      // 3. Log
      await db.from("activity_log").insert({
        catequista_id: user!.id,
        acao: "decisao_promocao",
        detalhes: { promocao_id: id, decisao, paroquia_id: paroquiaId },
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["promocoes-pendentes"] });
      qc.invalidateQueries({ queryKey: ["students"] });
      toast({ title: vars.decisao === "promovido" ? "Aluno promovido ✓" : "Aluno retido na etapa atual" });
    },
  });

  const [expandedStats, setExpandedStats] = useState(false);

  // ---------- cadastro de catequista ----------
  const createCatequista = useCreateCatequista();
  const [openCadastro, setOpenCadastro] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catForm, setCatForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    etapa: "",
    turma: "",
  });

  const resetCatForm = () => {
    setCatForm({ name: "", username: "", email: "", password: "", etapa: "", turma: "" });
    setShowPass(false);
  };

  const handleCreateCatequista = async () => {
    if (!catForm.name.trim() || !catForm.username.trim() || !catForm.password.trim() || !catForm.email.trim()) return;
    setSaving(true);
    try {
      const etapaFinal = nomeTurma(catForm.etapa, catForm.turma || undefined);
      await createCatequista.mutateAsync({
        name: catForm.name,
        username: catForm.username,
        password: catForm.password,
        email: catForm.email,
        etapa: etapaFinal || null,
        role: "catequista",
        paroquia_id: paroquiaId || null,
        is_coordenador: false,
      });
      setOpenCadastro(false);
      resetCatForm();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-24">
      <PageHeader title="Painel do Coordenador" subtitle={user?.paroquia_nome ?? "Paróquia"} />

      <div className="px-4 space-y-4">
        {/* Cards de resumo */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Alunos ativos", value: stats?.total ?? 0, icon: Users, color: "text-primary" },
            { label: "Catequistas", value: stats?.totalCat ?? 0, icon: GraduationCap, color: "text-success" },
            { label: "Presenças", value: stats?.present ?? 0, icon: CheckCircle, color: "text-success" },
            { label: "Faltas NJ", value: stats?.absent ?? 0, icon: XCircle, color: "text-destructive" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-4">
              <Icon className={cn("h-5 w-5 mb-1", color)} />
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Catequistas da paróquia */}
        {(stats?.catequistas?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-border bg-card p-4">
            <button className="flex w-full items-center justify-between"
              onClick={() => setExpandedStats((p) => !p)}>
              <div className="flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-primary" />
                <span className="font-semibold text-sm">Catequistas e Etapas</span>
              </div>
              {expandedStats ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {expandedStats && (
              <div className="mt-3 space-y-1.5">
                {stats!.catequistas.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 font-medium">{c.name}</span>
                    <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{c.etapa ?? "-"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== BLOCO DE PROMOÇÕES MANUAIS ===== */}
        {loadingPendentes && (
          <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando promoções pendentes...
          </div>
        )}

        {!loadingPendentes && pendentes.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <span className="font-bold text-warning">Promoções Pendentes - {pendentes.length} aluno{pendentes.length !== 1 ? "s" : ""}</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Esses alunos ultrapassaram o limite de 3 faltas no ano {anoAtual}. Decida manualmente a promoção.
            </p>
            <div className="space-y-3">
              {pendentes.map((p: any) => {
                const etapaAtual = p.students?.class_name ?? "";
                const catEquistaEtapa = p.students?.catequistas?.etapa ?? null;
                const novaEtapa = catEquistaEtapa ?? proximaEtapa(etapaAtual);
                return (
                  <div key={p.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <p className="font-semibold text-sm">{p.students?.name ?? "-"}</p>
                        <p className="text-xs text-muted-foreground">
                          {etapaAtual}{novaEtapa !== etapaAtual ? ` → ${novaEtapa}` : " (sem próxima etapa)"}
                        </p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="text-destructive font-semibold">{p.score_faltas} faltas equiv.</p>
                        <p className="text-muted-foreground">{p.faltas_nao_justificadas} NJ · {p.meses_sem_missa} meses s/ missa</p>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline"
                        className="flex-1 border-success/50 text-success hover:bg-success/10"
                        onClick={() => decisionMutation.mutate({ id: p.id, studentId: p.student_id, decisao: "promovido", etapaAtual, catequistaEtapa: catEquistaEtapa })}
                        disabled={decisionMutation.isPending}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1" /> Promover para {novaEtapa}
                      </Button>
                      <Button size="sm" variant="outline"
                        className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                        onClick={() => decisionMutation.mutate({ id: p.id, studentId: p.student_id, decisao: "retido", etapaAtual, catequistaEtapa: catEquistaEtapa })}
                        disabled={decisionMutation.isPending}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Reter
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Este bloco desaparece automaticamente quando todas as decisões forem tomadas.
            </p>
          </div>
        )}

        {/* ===== CADASTRAR CATEQUISTA ===== */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <span className="font-bold text-primary">Cadastrar Catequista</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Cadastre novos catequistas para a sua paróquia. O e-mail é obrigatório para que o catequista possa recuperar a senha.
          </p>
          <Button className="w-full" variant="outline" onClick={() => { resetCatForm(); setOpenCadastro(true); }}>
            <UserPlus className="h-4 w-4 mr-2" /> Novo Catequista
          </Button>
        </div>

        {/* Botão novo ano catequético */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-bold text-primary">Encerrar Ano Catequético</span>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Encerra o ano {anoAtual}, promove os alunos aptos automaticamente e permite que você decida o destino dos demais.
          </p>
          <Button className="w-full" variant="outline" onClick={() => navigate("/ano-letivo")}>
            <GraduationCap className="h-4 w-4 mr-2" /> Iniciar encerramento do ano
          </Button>
        </div>

      </div>

      {/* ===== DIALOG CADASTRAR CATEQUISTA ===== */}
      <Dialog open={openCadastro} onOpenChange={setOpenCadastro}>
        <DialogContent className="mx-4 max-w-sm">
          <DialogHeader>
            <DialogTitle>Novo Catequista</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                placeholder="Ex: Maria Silva"
              />
            </div>
            <div>
              <Label>Nome de usuário</Label>
              <Input
                autoComplete="off"
                autoCapitalize="none"
                value={catForm.username}
                onChange={(e) =>
                  setCatForm({
                    ...catForm,
                    username: e.target.value.toLowerCase().replace(/\s+/g, "_"),
                  })
                }
                placeholder="Ex: maria_silva"
              />
            </div>
            <div>
              <Label>
                E-mail{" "}
                <span className="text-xs text-destructive font-normal">(obrigatório)</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  autoComplete="off"
                  value={catForm.email}
                  onChange={(e) => setCatForm({ ...catForm, email: e.target.value })}
                  placeholder="catequista@email.com"
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Usado para recuperação de senha
              </p>
            </div>
            <div>
              <Label>Senha</Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={catForm.password}
                  onChange={(e) => setCatForm({ ...catForm, password: e.target.value })}
                  placeholder="Crie uma senha"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  tabIndex={-1}
                >
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Etapa</Label>
              <Select
                value={catForm.etapa}
                onValueChange={(v) => setCatForm({ ...catForm, etapa: v, turma: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a etapa" />
                </SelectTrigger>
                <SelectContent>
                  {ETAPAS.map((e) => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {catForm.etapa && (
              <div>
                <Label>
                  Turma{" "}
                  <span className="text-muted-foreground text-xs font-normal ml-1">
                    (opcional - A, B, C...)
                  </span>
                </Label>
                <Select
                  value={catForm.turma || "__none__"}
                  onValueChange={(v) =>
                    setCatForm({ ...catForm, turma: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem subturma</SelectItem>
                    {["A", "B", "C", "D", "E", "F", "G", "H"].map((l) => (
                      <SelectItem key={l} value={l}>
                        Turma {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {catForm.turma && (
                  <p className="text-xs text-primary mt-1 font-medium">
                    Turma final: <strong>{catForm.etapa} {catForm.turma}</strong>
                  </p>
                )}
              </div>
            )}

            <Button
              className="w-full h-11"
              onClick={handleCreateCatequista}
              disabled={
                saving ||
                !catForm.name.trim() ||
                !catForm.username.trim() ||
                !catForm.email.trim() ||
                !catForm.password.trim()
              }
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                  Criando...
                </span>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" /> Criar catequista
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
