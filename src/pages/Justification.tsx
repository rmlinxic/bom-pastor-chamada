import { useMemo, useState } from "react";
import { CheckCircle2, Church } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubmitJustification } from "@/hooks/useAttendance";
import { useParoquias } from "@/hooks/useParoquias";
import {
  publicJustificationClassSuffix,
  publicJustificationStages,
  publicJustificationStudentsForStage,
  usePublicJustificationClasses,
  usePublicJustificationStudents,
} from "@/hooks/usePublicJustificationSelection";
import { latestCatechesisSaturday, parseLocalDate } from "@/lib/dates";

export default function Justification() {
  const [paroquiaId, setParoquiaId] = useState("");
  const [stage, setStage] = useState("");
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState(latestCatechesisSaturday);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const serverDay = new Date();
  const minDay = new Date(serverDay); minDay.setUTCDate(minDay.getUTCDate() - 366);
  const maxDay = new Date(serverDay); maxDay.setUTCDate(maxDay.getUTCDate() + 30);
  const minDate = minDay.toISOString().slice(0, 10);
  const maxDate = maxDay.toISOString().slice(0, 10);
  const validDate = !!parseLocalDate(date) && date >= minDate && date <= maxDate;
  const mutation = useSubmitJustification();
  const paroquiaQuery = useParoquias();
  const classesQuery = usePublicJustificationClasses(paroquiaId);
  const studentsQuery = usePublicJustificationStudents(paroquiaId, stage);

  const stages = useMemo(() => publicJustificationStages(classesQuery.data ?? []), [classesQuery.data]);
  const students = useMemo(
    () => publicJustificationStudentsForStage(studentsQuery.data ?? [], stage),
    [studentsQuery.data, stage],
  );
  const selectedStudent = students.find((student) => student.id === studentId);
  const duplicateName = !!selectedStudent && students.filter((student) =>
    student.class_name === selectedStudent.class_name &&
    student.name.trim().toLocaleLowerCase("pt-BR") === selectedStudent.name.trim().toLocaleLowerCase("pt-BR")
  ).length > 1;
  const reasonLength = reason.trim().length;
  const rosterReady = !classesQuery.isLoading && !classesQuery.isError && !studentsQuery.isLoading && !studentsQuery.isError;
  const canSubmit = !!paroquiaId && !!stage && !!selectedStudent && rosterReady && validDate && reasonLength >= 3 && reasonLength <= 500;

  const handleParoquiaChange = (value: string) => {
    setParoquiaId(value);
    setStage("");
    setStudentId("");
  };

  const handleStageChange = (value: string) => {
    setStage(value);
    setStudentId("");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || !selectedStudent) return;
    mutation.mutate({
      studentId: selectedStudent.id,
      className: selectedStudent.class_name,
      paroquiaId,
      date,
      reason: reason.trim(),
    }, {
      onSuccess: () => {
        setSubmitted(true);
        setParoquiaId("");
        setStage("");
        setStudentId("");
        setDate(latestCatechesisSaturday());
        setReason("");
      },
    });
  };

  return <div className="public-shell"><div className="public-panel max-w-lg">
    <div className="mb-8 flex flex-col items-center">
      <div className="brand-mark mb-4 h-16 w-16"><Church className="h-8 w-8" /></div>
      <p className="brand-kicker mb-2">Portal das famílias</p>
      <h1 className="text-center text-3xl font-bold">Justificativa de Falta</h1>
      <p className="mt-2 text-center text-sm text-muted-foreground">Catequese Bom Pastor</p>
    </div>
    {submitted ? <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center" role="status">
      <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-success" />
      <p className="text-lg font-semibold">Justificativa enviada</p>
      <p className="mt-2 text-sm text-muted-foreground">Será aplicada à falta ou guardada até a chamada. Se precisar, o catequista poderá recusá-la.</p>
      <Button className="mt-5 w-full" onClick={() => setSubmitted(false)}>Enviar outra justificativa</Button>
    </div> : <form onSubmit={handleSubmit} className="space-y-5">
      <p className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">Selecione a comunidade, a etapa e o nome do catequizando. O catequista poderá conferir e recusar a justificativa, se necessário.</p>

      <div className="space-y-1.5"><Label htmlFor="justification-parish">Comunidade / Paróquia</Label>
        {paroquiaQuery.isError ? <div className="space-y-2" role="alert"><p className="text-sm text-destructive">Não foi possível carregar as comunidades.</p><Button type="button" variant="outline" onClick={() => void paroquiaQuery.refetch()}>Tentar novamente</Button></div> : <Select value={paroquiaId} onValueChange={handleParoquiaChange} disabled={paroquiaQuery.isLoading}>
          <SelectTrigger id="justification-parish"><SelectValue placeholder={paroquiaQuery.isLoading ? "Carregando comunidades..." : "Selecione a comunidade"} /></SelectTrigger>
          <SelectContent>{(paroquiaQuery.data ?? []).filter((p) => p.ativa).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
        </Select>}
      </div>

      <div className="space-y-1.5"><Label htmlFor="justification-stage">Etapa do catequizando</Label>
        {classesQuery.isError && paroquiaId ? <div className="space-y-2" role="alert"><p className="text-sm text-destructive">Não foi possível carregar as etapas desta comunidade.</p><Button type="button" variant="outline" onClick={() => void classesQuery.refetch()}>Tentar novamente</Button></div> : <Select value={stage} onValueChange={handleStageChange} disabled={!paroquiaId || classesQuery.isLoading}>
          <SelectTrigger id="justification-stage"><SelectValue placeholder={!paroquiaId ? "Selecione a comunidade primeiro" : classesQuery.isLoading ? "Carregando etapas..." : stages.length ? "Selecione a etapa" : "Nenhuma etapa disponível"} /></SelectTrigger>
          <SelectContent>{stages.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
        </Select>}
      </div>

      <div className="space-y-1.5"><Label htmlFor="justification-student">Nome do catequizando</Label>
        {studentsQuery.isError && paroquiaId && stage ? <div className="space-y-2" role="alert"><p className="text-sm text-destructive">Não foi possível carregar os nomes desta etapa.</p><Button type="button" variant="outline" onClick={() => void studentsQuery.refetch()}>Tentar novamente</Button></div> : <Select value={studentId} onValueChange={setStudentId} disabled={!stage || studentsQuery.isLoading}>
          <SelectTrigger id="justification-student"><SelectValue placeholder={!stage ? "Selecione a etapa primeiro" : studentsQuery.isLoading ? "Carregando nomes..." : students.length ? "Selecione o nome do catequizando" : "Nenhum nome disponível"} /></SelectTrigger>
          <SelectContent>{students.map((student) => {
            const suffix = publicJustificationClassSuffix(student.class_name, stage);
            return <SelectItem key={student.id} value={student.id}><span className="font-medium">{student.name}</span>{suffix && <span className="ml-2 text-xs text-muted-foreground">Turma {suffix}</span>}</SelectItem>;
          })}</SelectContent>
        </Select>}
        {duplicateName && <p className="text-xs text-muted-foreground" role="note">Há nomes iguais nesta turma; confirme com o catequista qual catequizando selecionar.</p>}
      </div>

      <div className="space-y-1.5"><Label htmlFor="absence-date">Data da falta</Label><Input id="absence-date" type="date" value={date} min={minDate} max={maxDate} onChange={(event) => setDate(event.target.value)} required />{date && !validDate && <p role="alert" className="text-sm text-destructive">Escolha uma data dentro dos últimos 366 dias ou até 30 dias à frente.</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="reason">Motivo da falta</Label><Textarea id="reason" value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} rows={4} required /><p className="text-right text-xs text-muted-foreground">{reason.length}/500</p></div>
      <Button type="submit" className="h-12 w-full" disabled={mutation.isPending || !canSubmit}>{mutation.isPending ? "Enviando..." : "Enviar justificativa"}</Button>
    </form>}
  </div></div>;
}
