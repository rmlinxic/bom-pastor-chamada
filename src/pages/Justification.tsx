import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Church } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useSubmitJustification } from "@/hooks/useAttendance";

export default function Justification() {
  const [name, setName] = useState("");
  const [date, setDate] = useState<Date>();
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const mutation = useSubmitJustification();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !date || !reason.trim()) return;
    mutation.mutate(
      { studentName: name, date: format(date, "yyyy-MM-dd"), reason },
      {
        onSuccess: () => {
          setSubmitted(true);
          setName("");
          setDate(undefined);
          setReason("");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Church className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">Justificativa de Falta</h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Paróquia Bom Pastor — Portal dos Pais
          </p>
        </div>

        {submitted ? (
          <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center animate-fade-in">
            <p className="text-lg font-semibold text-success">Justificativa enviada!</p>
            <p className="text-sm text-muted-foreground mt-2">
              O status da falta foi atualizado automaticamente.
            </p>
            <Button onClick={() => setSubmitted(false)} className="mt-4">
              Enviar outra
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 animate-fade-in">
            <div>
              <Label htmlFor="student-name">Nome do Aluno</Label>
              <Input id="student-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo do catequizando" required />
            </div>
            <div>
              <Label>Data da Falta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP", { locale: ptBR }) : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label htmlFor="reason">Motivo</Label>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Descreva o motivo da falta" rows={4} required />
            </div>
            <Button type="submit" className="w-full h-12 text-base font-semibold" disabled={mutation.isPending}>
              {mutation.isPending ? "Enviando..." : "Enviar Justificativa"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
