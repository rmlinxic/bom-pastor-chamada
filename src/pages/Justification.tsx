import { useState } from "react";
import { Church, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubmitJustification } from "@/hooks/useAttendance";
import { useParoquias } from "@/hooks/useParoquias";
import { localDateString } from "@/lib/dates";

export default function Justification() {
  const [paroquiaId, setParoquiaId] = useState("");
  const [studentName, setStudentName] = useState("");
  const [guardianContact, setGuardianContact] = useState("");
  const [date, setDate] = useState(localDateString);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const mutation = useSubmitJustification();
  const { data: paroquias = [], isLoading } = useParoquias();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    mutation.mutate({ paroquiaId, studentName: studentName.trim(), guardianContact, date, reason: reason.trim() }, {
      onSuccess: () => { setSubmitted(true); setStudentName(""); setGuardianContact(""); setReason(""); },
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
      <p className="text-lg font-semibold">Solicitação recebida</p>
      <p className="mt-2 text-sm text-muted-foreground">Se o nome e o telefone coincidirem com o cadastro, a justificativa será registrada. Em caso de dúvida, procure o catequista.</p>
      <Button className="mt-5 w-full" onClick={() => setSubmitted(false)}>Enviar outra justificativa</Button>
    </div> : <form onSubmit={handleSubmit} className="space-y-5">
      <p className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">Informe o nome completo e o telefone do responsável usado no cadastro. Você também pode justificar antes do encontro.</p>
      <div className="space-y-1.5"><Label htmlFor="justification-parish">Comunidade / Paróquia</Label>
        <Select value={paroquiaId} onValueChange={setParoquiaId} disabled={isLoading}>
          <SelectTrigger id="justification-parish"><SelectValue placeholder="Selecione a comunidade" /></SelectTrigger>
          <SelectContent>{paroquias.filter((p) => p.ativa).map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="student-name">Nome completo do catequizando</Label><Input id="student-name" value={studentName} onChange={(e) => setStudentName(e.target.value)} minLength={2} maxLength={200} required autoComplete="off" /></div>
      <div className="space-y-1.5"><Label htmlFor="guardian-contact">Telefone do responsável cadastrado</Label><Input id="guardian-contact" type="tel" value={guardianContact} onChange={(e) => setGuardianContact(e.target.value)} maxLength={25} required autoComplete="tel" placeholder="DDD + número" /></div>
      <div className="space-y-1.5"><Label htmlFor="absence-date">Data da falta</Label><Input id="absence-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
      <div className="space-y-1.5"><Label htmlFor="reason">Motivo da falta</Label><Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} rows={4} required /><p className="text-right text-xs text-muted-foreground">{reason.length}/500</p></div>
      <Button type="submit" className="h-12 w-full" disabled={mutation.isPending || !paroquiaId || !studentName.trim() || !guardianContact.trim() || !date || reason.trim().length < 3}>{mutation.isPending ? "Enviando..." : "Enviar justificativa"}</Button>
    </form>}
  </div></div>;
}
