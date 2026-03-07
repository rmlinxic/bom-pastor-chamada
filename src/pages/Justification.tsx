import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Church, CheckCircle2 } from "lucide-react";
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
import { useStudents } from "@/hooks/useStudents";

export default function Justification() {
  const [studentId, setStudentId] = useState("");
  const [date, setDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useSubmitJustification();
  const { data: students = [], isLoading: loadingStudents } = useStudents();

  // Alunos ordenados por turma e depois por nome
  const sortedStudents = [...students].sort((a, b) =>
    a.class_name !== b.class_name
      ? a.class_name.localeCompare(b.class_name)
      : a.name.localeCompare(b.name)
  );

  const canSubmit = !!studentId && !!date && reason.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate(
      { studentId, date: format(date!, "yyyy-MM-dd"), reason },
      {
        onSuccess: () => {
          setSubmitted(true);
          setStudentId("");
          setDate(undefined);
          setReason("");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Cabeçalho */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-3">
            <Church className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground text-center">
            Justificativa de Falta
          </h1>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Paróquia Bom Pastor — Portal dos Pais
          </p>
        </div>

        {submitted ? (
          /* Estado de sucesso */
          <div className="rounded-lg border border-success/30 bg-success/10 p-6 text-center animate-fade-in">
            <CheckCircle2 className="h-12 w-12 text-success mx-auto mb-3" />
            <p className="text-lg font-semibold text-success">
              Justificativa enviada!
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              O status da falta foi atualizado automaticamente no sistema.
            </p>
            <Button
              onClick={() => setSubmitted(false)}
              className="mt-5 w-full"
            >
              Enviar outra justificativa
            </Button>
          </div>
        ) : (
          /* Formulário */
          <form onSubmit={handleSubmit} className="space-y-5 animate-fade-in">
            {/* Seletor de aluno */}
            <div className="space-y-1.5">
              <Label>Nome do Catequizando</Label>
              <Select
                value={studentId}
                onValueChange={setStudentId}
                disabled={loadingStudents}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      loadingStudents
                        ? "Carregando lista de alunos..."
                        : "Selecione o nome do seu filho(a)"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {sortedStudents.length === 0 && !loadingStudents && (
                    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                      Nenhum aluno cadastrado ainda.
                    </div>
                  )}
                  {sortedStudents.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        — {s.class_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Seletor de data */}
            <div className="space-y-1.5">
              <Label>Data da Falta</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date
                      ? format(date, "PPP", { locale: ptBR })
                      : "Selecione a data da falta"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                    disabled={(d) => d > new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Motivo */}
            <div className="space-y-1.5">
              <Label htmlFor="reason">Motivo da Falta</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo da falta (ex: doen\u00e7a, consulta m\u00e9dica, viagem familiar...)"
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

            <p className="text-xs text-center text-muted-foreground">
              A falta precisa ter sido registrada pelo catequista para que a
              justificativa seja aceita.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
