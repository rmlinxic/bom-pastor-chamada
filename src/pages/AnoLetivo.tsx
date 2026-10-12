import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Download, GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ETAPAS, nomeTurma, parseTurma, proximaEtapa } from "@/lib/etapas";
import { localMonthString, shiftMonth } from "@/lib/dates";
import { downloadAttendanceArchive } from "@/lib/attendance-archive";
import { readAllRows } from "@/lib/query-pages";

const db = supabase as any;
type Catequista = { id: string; name: string; etapa: string | null };
type Student = { id: string; name: string; class_name: string; catequista_id: string | null; active: boolean };
type Attendance = { student_id: string; date: string; status?: string };
const EMPTY_TEACHERS: Catequista[] = [];
const EMPTY_STUDENTS: Student[] = [];

function destinationClass(className: string): string {
  const { turma } = parseTurma(className);
  return nomeTurma(proximaEtapa(className), turma);
}

export default function AnoLetivo() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const paroquiaId = user?.paroquia_id;
  const anoAtual = new Date().getFullYear();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [confirmText, setConfirmText] = useState("");
  const [selecoes, setSelecoes] = useState<Record<string, string>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ano-letivo-planejamento", paroquiaId],
    queryFn: async () => {
      const [cats, students] = await Promise.all([
        readAllRows<Catequista>((from, to) => db.from("catequistas").select("id, name, etapa, paroquia_id, role, active").eq("paroquia_id", paroquiaId).eq("active", true).eq("role", "catequista").order("id").range(from, to)),
        readAllRows<Student>((from, to) => db.from("students").select("*").eq("paroquia_id", paroquiaId).order("id").range(from, to)),
      ]);
      return { catequistas: cats, students };
    },
    enabled: !!paroquiaId,
  });
  const catequistas = data?.catequistas ?? EMPTY_TEACHERS;
  const students = data?.students ?? EMPTY_STUDENTS;
  const turmas = useMemo(() => [...new Set<string>([
    ...ETAPAS,
    ...catequistas.map((cat) => cat.etapa).filter((etapa): etapa is string => !!etapa),
    ...students.filter((student) => student.active).map((student) => destinationClass(student.class_name)),
  ])], [catequistas, students]);
  const obrigatorias = new Set(students.filter((student) => student.active).map((student) => destinationClass(student.class_name)));
  const atribuicoes = turmas.map((turma) => ({
    turma,
    catequistaId: selecoes[`${paroquiaId}:${turma}`] ?? catequistas.find((cat) => cat.etapa === turma)?.id ?? "",
  }));
  const selecionados = atribuicoes.map((item) => item.catequistaId).filter(Boolean);
  const duplicados = new Set(selecionados).size !== selecionados.length;
  const planoValido = !!paroquiaId && !isLoading && !isError && catequistas.length > 0 && !duplicados && atribuicoes.every((item) =>
    (!obrigatorias.has(item.turma) || !!item.catequistaId) && (!item.catequistaId || catequistas.some((cat) => cat.id === item.catequistaId))
  );

  const processarAno = useMutation({
    mutationFn: async () => {
      if (!user || !paroquiaId || !planoValido) throw new Error("Revise as atribuições de catequistas.");
      const { data: ano, error: anoError } = await db.from("anos_catequeticos").select("encerrado_em").eq("paroquia_id", paroquiaId).eq("ano", anoAtual).maybeSingle();
      if (anoError) throw anoError;
      if (ano?.encerrado_em) throw new Error("Este ano catequético já foi encerrado.");

      // A fresh snapshot includes inactive students and the full year's records.
      const allStudents = await readAllRows<Student>((from, to) => db.from("students").select("*").eq("paroquia_id", paroquiaId).order("id").range(from, to));
      const studentIds = allStudents.map((student) => student.id);
      const start = `${anoAtual}-01-01`;
      const end = `${anoAtual}-12-31`;
      async function readYearRecords(table: "attendance" | "mass_attendance") {
        const records: Attendance[] = [];
        // Bound filter URLs as well as response pages for large parishes.
        for (let offset = 0; offset < studentIds.length; offset += 200) {
          const ids = studentIds.slice(offset, offset + 200);
          records.push(...await readAllRows<Attendance>((from, to) => db.from(table).select("*").in("student_id", ids).gte("date", start).lte("date", end).order("id").range(from, to)));
        }
        return records;
      }
      const [attendance, massAttendance] = await Promise.all([
        readYearRecords("attendance"), readYearRecords("mass_attendance"),
      ]);
      const aptos: { id: string; novaEtapa: string; catequistaId: string }[] = [];
      const pendentes: { student_id: string; faltas_nao_justificadas: number; meses_sem_missa: number; score_faltas: number; destino_class_name: string; destino_catequista_id: string }[] = [];
      for (const student of allStudents.filter((student) => student.active)) {
        const novaEtapa = destinationClass(student.class_name);
        const catequistaId = atribuicoes.find((item) => item.turma === novaEtapa)?.catequistaId;
        if (!catequistaId) throw new Error("Há uma turma sem catequista. Recarregue e revise o planejamento.");
        const records = attendance.filter((record) => record.student_id === student.id);
        const since = records.map((record) => record.date).sort()[0];
        const faltas = records.filter((record) => record.status === "falta_nao_justificada").length;
        let meses = 0;
        if (since) {
          const massMonths = new Set(massAttendance.filter((record) => record.student_id === student.id).map((record) => record.date.slice(0, 7)));
          for (let month = since.slice(0, 7); month <= localMonthString(); month = shiftMonth(month, 1)) {
            if (!massMonths.has(month)) meses++;
          }
        }
        const score = faltas + meses;
        if (score <= 3) aptos.push({ id: student.id, novaEtapa, catequistaId });
        else pendentes.push({ student_id: student.id, faltas_nao_justificadas: faltas, meses_sem_missa: meses, score_faltas: score, destino_class_name: novaEtapa, destino_catequista_id: catequistaId });
      }
      // Download failure must stop the transition before any write.
      downloadAttendanceArchive({ year: anoAtual, paroquiaId, students: allStudents, catequistas, attendance, massAttendance });
      for (const student of aptos) {
        const { error } = await db.from("students").update({ class_name: student.novaEtapa, catequista_id: student.catequistaId, ano_catequetico: anoAtual + 1 }).eq("id", student.id).eq("paroquia_id", paroquiaId);
        if (error) throw error;
      }
      if (pendentes.length) {
        const { error } = await db.from("promocoes_pendentes").upsert(pendentes.map((item) => ({ ...item, paroquia_id: paroquiaId, ano_catequetico: anoAtual })), { onConflict: "student_id,ano_catequetico" });
        if (error) throw error;
      }
      for (const cat of catequistas) {
        const etapa = atribuicoes.find((item) => item.catequistaId === cat.id)?.turma ?? null;
        const { error } = await db.from("catequistas").update({ etapa }).eq("id", cat.id).eq("paroquia_id", paroquiaId);
        if (error) throw error;
      }
      const { error: yearError } = await db.from("anos_catequeticos").upsert({ paroquia_id: paroquiaId, ano: anoAtual, encerrado_em: new Date().toISOString(), ativo: false }, { onConflict: "paroquia_id,ano" });
      if (yearError) throw yearError;
      const { error: logError } = await db.from("activity_log").insert({ catequista_id: user.id, acao: "encerramento_ano", detalhes: { ano: anoAtual, aptos: aptos.length, pendentes: pendentes.length, paroquia_id: paroquiaId, atribuicoes } });
      if (logError) throw logError;
      return { aptos: aptos.length, pendentes: pendentes.length };
    },
    onSuccess: ({ aptos, pendentes }) => {
      toast({ title: "Ano encerrado com sucesso!", description: `${aptos} aluno(s) promovido(s). ${pendentes} aguardando decisão manual. Guarde o arquivo baixado.` });
      navigate("/coordenador");
    },
    onSettled: () => {
      for (const key of ["students", "promocoes-pendentes", "catequistas", "catequistas-paroquia", "coord-stats", "ano-letivo-planejamento", "pending-center"]) qc.invalidateQueries({ queryKey: [key] });
    },
    onError: (error) => {
      toast({ title: "Não foi possível concluir o encerramento.", description: error instanceof Error && error.message === "Este ano catequético já foi encerrado." ? error.message : "Confira o arquivo e os dados antes de repetir: algumas alterações podem ter sido salvas.", variant: "destructive" });
    },
  });
  const processing = processarAno.isPending;

  return (
    <div>
      <PageHeader title="Encerramento de Ano" subtitle={`${anoAtual} → ${anoAtual + 1}`} />
      <div className="px-4 space-y-4">
        <p className="text-center text-sm text-muted-foreground">Passo {step} de 3</p>
        {step === 1 && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 space-y-4">
          <p className="flex gap-2 font-bold text-destructive"><AlertTriangle className="h-5 w-5" />Encerrar o ano e preparar o próximo</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li>Alunos aptos avançam de etapa; os demais aguardam decisão manual.</li>
            <li>Você escolhe quem ficará responsável por cada etapa e subturma.</li>
            <li>Um arquivo do ano será baixado antes das mudanças. Guarde-o para consultar as turmas antigas.</li>
            <li>As chamadas e presenças nas missas permanecem no banco.</li>
            <li>As mudanças de turma não podem ser desfeitas automaticamente.</li>
          </ul>
          <label className="block text-sm font-medium">Digite CONFIRMAR para prosseguir:
            <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} placeholder="CONFIRMAR" className="mt-2 font-mono" />
          </label>
          <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => navigate("/coordenador")}>Cancelar</Button><Button className="flex-1" disabled={confirmText !== "CONFIRMAR"} onClick={() => setStep(2)}>Prosseguir<ArrowRight className="h-4 w-4 ml-1" /></Button></div>
        </div>}
        {step === 2 && <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <p className="flex gap-2 font-bold"><GraduationCap className="h-5 w-5 text-primary" />Catequista de cada etapa em {anoAtual + 1}</p>
            <p className="text-sm text-muted-foreground">A atribuição atual é uma sugestão. Escolha quem permanece ou assume cada turma. Cada catequista pode assumir uma turma.</p>
            {isLoading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : isError ? <p role="alert" className="text-sm text-destructive">Não foi possível carregar o planejamento. Recarregue a página.</p> : catequistas.length === 0 ? <p>Nenhum catequista ativo encontrado.</p> : atribuicoes.map((item) => <div key={item.turma} className="space-y-2">
              <p id={`turma-${turmas.indexOf(item.turma)}`} className="text-sm font-semibold">{item.turma}{obrigatorias.has(item.turma) ? " *" : ""}</p>
              <Select value={item.catequistaId || "__none__"} onValueChange={(value) => setSelecoes((previous) => ({ ...previous, [`${paroquiaId}:${item.turma}`]: value === "__none__" ? "" : value }))}>
                <SelectTrigger aria-labelledby={`turma-${turmas.indexOf(item.turma)}`}><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__none__">Sem catequista</SelectItem>{catequistas.map((cat) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>)}
            <p className="text-xs text-muted-foreground">* Turma que receberá alunos: escolha obrigatória.</p>
            {duplicados && <p role="alert" className="text-sm text-destructive">O mesmo catequista está em mais de uma turma. Ajuste as escolhas.</p>}
          </div>
          <div className="flex gap-3"><Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Voltar</Button><Button className="flex-1" disabled={!planoValido} onClick={() => setStep(3)}>Revisar<ArrowRight className="h-4 w-4 ml-1" /></Button></div>
        </div>}
        {step === 3 && <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="font-bold">Confirmar responsáveis por turma</p>
            {atribuicoes.map((item) => <p key={item.turma} className="text-sm"><strong>{item.turma}</strong>: {catequistas.find((cat) => cat.id === item.catequistaId)?.name ?? "Sem catequista"}</p>)}
            <p className="text-sm text-muted-foreground">Ao confirmar, será baixado o arquivo de {anoAtual} com alunos, turmas, chamadas e missas. Os dados históricos permanecem no banco.</p>
          </div>
          <div className="flex gap-3"><Button variant="outline" className="flex-1" disabled={processing} onClick={() => setStep(2)}>Voltar</Button><Button className="flex-1" onClick={() => processarAno.mutate()} disabled={processing || !planoValido}>{processing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}{processing ? "Processando..." : "Baixar arquivo e Encerrar Ano"}</Button></div>
        </div>}
      </div>
    </div>
  );
}
