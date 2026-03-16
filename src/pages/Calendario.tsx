import { useState, useRef, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, CalendarDays, X } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import * as XLSX from "xlsx";

interface EventoCatequese {
  data: Date;
  nome: string;
  descricao: string;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  // Excel serial number
  if (typeof value === "number") {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    // Try DD/MM/YYYY
    const brMatch = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (brMatch) {
      const [, d, m, y] = brMatch;
      const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
      const date = new Date(year, parseInt(m) - 1, parseInt(d));
      return isNaN(date.getTime()) ? null : date;
    }
    // Try ISO
    const iso = parseISO(value);
    return isNaN(iso.getTime()) ? null : iso;
  }
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  return null;
}

export default function Calendario() {
  const [eventos, setEventos] = useState<EventoCatequese[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState<Date>(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState<Date | undefined>(undefined);
  const [modalAberto, setModalAberto] = useState(false);
  const [eventosDoDia, setEventosDoDia] = useState<EventoCatequese[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processarPlanilha = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        const novosEventos: EventoCatequese[] = [];
        // Skip first row if it looks like a header
        const startRow = typeof rows[0]?.[0] === "string" && isNaN(Date.parse(rows[0][0] as string)) ? 1 : 0;

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i];
          if (!row || (!row[0] && !row[1])) continue;
          const data = parseDate(row[0]);
          const nome = String(row[1] ?? "").trim();
          const descricao = String(row[2] ?? "").trim();
          if (data && nome) {
            novosEventos.push({ data, nome, descricao });
          }
        }

        if (novosEventos.length === 0) {
          toast({ title: "Nenhum evento encontrado", description: "Verifique se a planilha tem data na coluna A, nome na B e descrição na C.", variant: "destructive" });
          return;
        }

        setEventos(novosEventos);
        toast({ title: `${novosEventos.length} evento(s) importado(s)!`, description: "O calendário foi atualizado com os eventos da planilha." });
      } catch {
        toast({ title: "Erro ao ler a planilha", description: "Certifique-se de que o arquivo é .xlsx ou .xls válido.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(file);
  }, [toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processarPlanilha(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processarPlanilha(file);
  };

  const handleDayClick = (day: Date) => {
    const evs = eventos.filter((ev) => isSameDay(ev.data, day));
    setDiaSelecionado(day);
    setEventosDoDia(evs);
    setModalAberto(true);
  };

  const eventosDossMes = eventos.filter(
    (ev) => ev.data.getMonth() === mesSelecionado.getMonth() && ev.data.getFullYear() === mesSelecionado.getFullYear()
  );

  const diasComEvento = new Set(
    eventos.map((ev) => format(ev.data, "yyyy-MM-dd"))
  );

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <CalendarDays className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Calendário da Catequese</h1>
            <p className="text-sm text-muted-foreground">Cronograma compartilhado da paróquia</p>
          </div>
        </div>

        {/* Upload de planilha */}
        <Card
          className={`border-2 border-dashed transition-colors cursor-pointer ${
            arrastando ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-6 gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Importar planilha (.xlsx / .xls)</p>
            <p className="text-xs text-muted-foreground text-center">
              Coluna A: Data &nbsp;|&nbsp; Coluna B: Nome do evento &nbsp;|&nbsp; Coluna C: Descrição
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileChange}
            />
            {eventos.length > 0 && (
              <Badge variant="secondary" className="mt-1">
                {eventos.length} evento(s) carregado(s)
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Calendário interativo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {format(mesSelecionado, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase())}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              locale={ptBR}
              month={mesSelecionado}
              onMonthChange={setMesSelecionado}
              onDayClick={handleDayClick}
              modifiers={{
                temEvento: (date) => diasComEvento.has(format(date, "yyyy-MM-dd")),
              }}
              modifiersClassNames={{
                temEvento: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-primary",
              }}
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Lista de eventos do mês */}
        {eventosDossMes.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Eventos do mês</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {eventosDossMes
                .sort((a, b) => a.data.getTime() - b.data.getTime())
                .map((ev, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setDiaSelecionado(ev.data);
                      setEventosDoDia(eventos.filter((e) => isSameDay(e.data, ev.data)));
                      setModalAberto(true);
                    }}
                    className="w-full text-left flex items-start gap-3 rounded-lg p-3 hover:bg-muted transition-colors border border-border"
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-primary leading-none">
                        {format(ev.data, "dd")}
                      </span>
                      <span className="text-[10px] text-primary/70 leading-none uppercase">
                        {format(ev.data, "MMM", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{ev.nome}</p>
                      {ev.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{ev.descricao}</p>
                      )}
                    </div>
                  </button>
                ))}
            </CardContent>
          </Card>
        )}

        {eventos.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum evento ainda.</p>
            <p className="text-xs mt-1">Importe uma planilha para preencher o calendário.</p>
          </div>
        )}
      </div>

      {/* Modal de detalhes do dia */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {diaSelecionado && format(diaSelecionado, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          {eventosDoDia.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              <p className="text-sm">Nenhum evento neste dia.</p>
            </div>
          ) : (
            <div className="space-y-3 mt-2">
              {eventosDoDia.map((ev, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-1">
                  <p className="font-semibold text-sm text-foreground">{ev.nome}</p>
                  {ev.descricao && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ev.descricao}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" className="w-full mt-2" onClick={() => setModalAberto(false)}>
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
