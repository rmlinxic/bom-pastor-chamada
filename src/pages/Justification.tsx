import { useState, useMemo } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Church, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSubmitJustification } from "@/hooks/useAttendance";
import { usePublicStudents } from "@/hooks/useStudents";
import { useParoquias } from "@/hooks/useParoquias";

function getBaseEtapa(className: string): string {
  return className.replace(/\s+[AaBb]$/, "").trim();
}

function getSubTurma(className: string, base: string): string | null {
  const suffix = className.slice(base.length).trim();
  return suffix || null;
}

export default function Justification() {
  const [selectedParoquia, setSelectedParoquia] = useState("");
  const [selectedEtapa, setSelectedEtapa] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [wasPending, setWasPending] = useState(false);

  const mutation = useSubmitJustification();
  const { data: allStudents = [], isLoading: loadingStudents } = usePublicStudents();
  const { data: paroquias = [], isLoading: loadingParoquias } = useParoquias();

  // Alunos filtrados pela paróquia selecionada
  const studentsByParoquia = useMemo(() => {
    if (!selectedParoquia) return allStudents;
    return allStudents.filter((s: any) => s.paroquia_id === selectedParoquia);
  }, [allStudents, selectedParoquia]);

  const etapas = useMemo(() => {
    const bases = new Set(studentsByParoquia.map((s) => getBaseEtapa(s.class_name)));
    return Array.from(bases).sort();
  }, [studentsByParoquia]);

  const filteredStudents = useMemo(() => {
    if (!selectedEtapa) return [];
    return studentsByParoquia
      .filter((s) => getBaseEtapa(s.class_name) === selectedEtapa)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studentsByParoquia, selectedEtapa]);

  const canSubmit = !!studentId && !!date && reason.trim().length > 0;

  const handleParoquiaChange = (value: string) => {
    setSelectedParoquia(value);
    setSelectedEtapa("");
    setStudentId("");
  };

  const handleEtapaChange = (value: string) => {
    setSelectedEtapa(value);
    setStudentId("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate(
      { studentId, date: format(date!, "yyyy-MM-dd"), reason },
      {
        onSuccess: (result) => {
          setWasPending(result.pending);
          setSubmitted(true);
          setSelectedParoquia("");
          setSelectedEtapa("");
          setStudentId("");
          setDate(undefined);
          setReason("");
        },
      }
    );
  };

  const handleSendAnother = () => setSubmitted(false);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Church className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">
            Justificativa de Falta
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Portal dos Pais — Catequese
          </p>
        </div>

        {submitted ? (
          wasPending ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-6 text-center animate-fade-in">
              <Clock className="h-12 w-12 text-warning mx-auto mb-3" />
              <p className="text-lg font-semibold text-warning">Justificativa registrada!</p>
              <p className="text-sm text-muted-foreground mt-2">
                A chamada desse dia ainda não foi registrada. Sua justificativa
                foi salva e <strong>será aplicada automaticamente</strong> assim
                que o catequista marcar a presença.
              </p>
              <Button onClick={handleSendAnother} className="mt-5 w-full">Enviar outra justificativa</Button>
            </div>
          ) : (
            <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center animate-fade-in">
              <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
              <p className="text-lg font-semibold text-success">Falta justificada!</p>
              <p className="text-sm text-muted-foreground mt-2">
                O status foi atualizado automaticamente no sistema.
              </p>
              <Button onClick={handleSendAnother} className="mt-5 w-full">Enviar outra justificativa</Button>
            </div>
          )
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">Dica:</strong> Você pode enviar
              a justificativa mesmo <strong>antes da aula</strong>. Ela será
              registrada automaticamente quando o catequista marcar a chamada.
            </div>

            {/* 0º campo: Paróquia/Comunidade */}
            <div className="space-y-1.5">
              <Label>Comunidade / Paróquia</Label>
              <Select
                value={selectedParoquia}
                onValueChange={handleParoquiaChange}
                disabled={loadingParoquias}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={loadingParoquias ? "Carregando..." : "Selecione a comunidade"} />
                </SelectTrigger>
                <SelectContent>
                  {paroquias.filter((p) => p.ativa).length === 0 && !loadingParoquias && (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhuma comunidade cadastrada.</div>
                  )}
                  {paroquias.filter((p) => p.ativa).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 1º campo: Etapa */}
            <div className="space-y-1.5">
              <Label>Etapa do Catequizando</Label>
              <Select
                value={selectedEtapa}
                onValueChange={handleEtapaChange}
                disabled={!selectedParoquia || loadingStudents}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !selectedParoquia
                        ? "Selecione a comunidade primeiro"
                        : loadingStudents
                        ? "Carregando..."
                        : "Selecione a etapa"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {etapas.length === 0 && !loadingStudents && selectedParoquia && (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhuma etapa nesta comunidade.</div>
                  )}
                  {etapas.map((etapa) => (
                    <SelectItem key={etapa} value={etapa}>{etapa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2º campo: Nome do aluno */}
            <div className="space-y-1.5">
              <Label>Nome do Catequizando</Label>
              <Select
                value={studentId}
                onValueChange={setStudentId}
                disabled={!selectedEtapa || loadingStudents}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !selectedEtapa
                        ? "Selecione a etapa primeiro"
                        : filteredStudents.length === 0
                        ? "Nenhum aluno nesta etapa"
                        : "Selecione o nome do seu filho(a)"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {filteredStudents.map((s) => {
                    const sub = getSubTurma(s.class_name, selectedEtapa);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium">{s.name}</span>
                        {sub && <span className="ml-2 text-xs text-muted-foreground">— Turma {sub}</span>}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* 3º campo: Data */}
            <div className="space-y-1.5">
              <Label>Data da Falta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data da falta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            {/* 4º campo: Motivo */}
            <div className="space-y-1.5">
              <Label htmlFor="reason">Motivo da Falta</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo da falta (ex: doença, consulta médica, viagem familiar...)"
                rows={4}
                required
              />
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              disabled={mutation.isPending || !canSubmit}
            >
              {mutation.isPending ? "Enviando..." : "Enviar Justificativa"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
