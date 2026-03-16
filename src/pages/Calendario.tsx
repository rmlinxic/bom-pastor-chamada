import { useState, useRef, useEffect, useCallback } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  Download,
  CalendarDays,
  Plus,
  Trash2,
  Loader2,
  X,
  Sparkles,
  Clock,
  Lock,
} from "lucide-react";
import {
  format,
  parseISO,
  isToday,
  isTomorrow,
  differenceInCalendarDays,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Evento {
  id: string;
  data: string;
  nome: string;
  descricao: string | null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim()); current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseDateString(raw: string): string | null {
  const s = raw.trim();
  const br = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const dt = new Date(year, parseInt(m) - 1, parseInt(d));
    if (!isNaN(dt.getTime())) return format(dt, "yyyy-MM-dd");
  }
  const iso = parseISO(s);
  if (!isNaN(iso.getTime())) return format(iso, "yyyy-MM-dd");
  return null;
}

function downloadCSV(eventos: Evento[]) {
  const header = "data,nome,descricao";
  const rows = eventos
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((ev) => {
      const d = format(parseISO(ev.data), "dd/MM/yyyy");
      const nome = `"${(ev.nome ?? "").replace(/"/g, '""')}"`;
      const desc = `"${(ev.descricao ?? "").replace(/"/g, '""')}"`;
      return `${d},${nome},${desc}`;
    });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `calendario-catequese-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function getEventoLabel(dataStr: string): { label: string; variant: "hoje" | "amanha" | "breve" | "futuro" } {
  const d = parseISO(dataStr);
  if (isToday(d)) return { label: "Hoje", variant: "hoje" };
  if (isTomorrow(d)) return { label: "Amanh\u00e3", variant: "amanha" };
  const diff = differenceInCalendarDays(d, startOfDay(new Date()));
  if (diff <= 7) return { label: `Em ${diff} dias`, variant: "breve" };
  return { label: format(d, "dd/MM", { locale: ptBR }), variant: "futuro" };
}

export default function Calendario() {
  const { isCoordinator, isAdmin } = useAuth();
  const podeEditar = isCoordinator || isAdmin;

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mesSelecionado, setMesSelecionado] = useState<Date>(new Date());

  const [diaModal, setDiaModal] = useState<Date | null>(null);
  const [eventosDoDia, setEventosDoDia] = useState<Evento[]>([]);

  const [addModal, setAddModal] = useState(false);
  const [addData, setAddData] = useState("");
  const [addNome, setAddNome] = useState("");
  const [addDesc, setAddDesc] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchEventos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("calendario_eventos")
      .select("id, data, nome, descricao")
      .order("data", { ascending: true });
    if (error) {
      toast({ title: "Erro ao carregar eventos", description: error.message, variant: "destructive" });
    } else {
      setEventos((data as Evento[]) ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchEventos(); }, [fetchEventos]);

  const proximos = eventos
    .filter((ev) => differenceInCalendarDays(parseISO(ev.data), startOfDay(new Date())) >= 0)
    .slice(0, 5);

  const handleAddEvento = async () => {
    if (!podeEditar) return;
    if (!addData || !addNome.trim()) {
      toast({ title: "Preencha a data e o nome do evento.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("calendario_eventos").insert({
      data: addData,
      nome: addNome.trim(),
      descricao: addDesc.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar evento", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Evento adicionado!" });
      setAddModal(false);
      setAddData(""); setAddNome(""); setAddDesc("");
      fetchEventos();
    }
  };

  const handleDelete = async (id: string) => {
    if (!podeEditar) return;
    const { error } = await (supabase as any).from("calendario_eventos").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover evento", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Evento removido." });
      setEventos((prev) => prev.filter((e) => e.id !== id));
      setEventosDoDia((prev) => prev.filter((e) => e.id !== id));
      if (eventosDoDia.filter((e) => e.id !== id).length === 0) setDiaModal(null);
    }
    setDeleteId(null);
  };

  const processCSV = useCallback(async (file: File) => {
    if (!podeEditar) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const start = lines[0]?.toLowerCase().startsWith("data") ? 1 : 0;
    const novos: { data: string; nome: string; descricao: string | null }[] = [];
    for (let i = start; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const data = parseDateString(cols[0] ?? "");
      const nome = (cols[1] ?? "").replace(/^"|"$/g, "").trim();
      const descricao = (cols[2] ?? "").replace(/^"|"$/g, "").trim() || null;
      if (data && nome) novos.push({ data, nome, descricao });
    }
    if (novos.length === 0) {
      toast({ title: "Nenhum evento encontrado no CSV", description: "Formato: data,nome,descricao", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("calendario_eventos").insert(novos);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao importar CSV", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${novos.length} evento(s) importado(s) com sucesso!` });
      fetchEventos();
    }
  }, [toast, fetchEventos, podeEditar]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processCSV(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setArrastando(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processCSV(file);
  };

  const diasComEvento = new Set(eventos.map((ev) => ev.data));

  const handleDayClick = (day: Date) => {
    const isoDay = format(day, "yyyy-MM-dd");
    setEventosDoDia(eventos.filter((ev) => ev.data === isoDay));
    setDiaModal(day);
  };

  const eventosMes = eventos.filter((ev) => {
    const d = parseISO(ev.data);
    return d.getMonth() === mesSelecionado.getMonth() && d.getFullYear() === mesSelecionado.getFullYear();
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="container max-w-2xl mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Calend\u00e1rio da Catequese</h1>
              <p className="text-sm text-muted-foreground">Cronograma compartilhado da par\u00f3quia</p>
            </div>
          </div>
          {podeEditar && (
            <Button size="sm" onClick={() => setAddModal(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo evento
            </Button>
          )}
        </div>

        {/* PR\u00d3XIMOS EVENTOS */}
        {!loading && proximos.length > 0 && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Pr\u00f3ximos eventos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {proximos.map((ev) => {
                const { label, variant } = getEventoLabel(ev.data);
                const badgeClass =
                  variant === "hoje"
                    ? "bg-primary text-primary-foreground"
                    : variant === "amanha"
                    ? "bg-orange-500 text-white"
                    : variant === "breve"
                    ? "bg-yellow-500 text-white"
                    : "bg-muted text-muted-foreground";
                return (
                  <button
                    key={ev.id}
                    onClick={() => {
                      setEventosDoDia(eventos.filter((e) => e.data === ev.data));
                      setDiaModal(parseISO(ev.data));
                    }}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
                  >
                    <div className="flex-shrink-0 flex flex-col items-center w-9">
                      <span className="text-lg font-bold text-primary leading-none">
                        {format(parseISO(ev.data), "dd")}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase leading-none">
                        {format(parseISO(ev.data), "MMM", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{ev.nome}</p>
                      {ev.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{ev.descricao}</p>
                      )}
                    </div>
                    <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${badgeClass}`}>
                      <Clock className="h-3 w-3" />
                      {label}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Upload / Download CSV — s\u00f3 coordenador/admin v\u00ea */}
        {podeEditar ? (
          <div className="flex gap-2">
            <Card
              className={`flex-1 border-2 border-dashed cursor-pointer transition-colors ${
                arrastando ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <CardContent className="flex items-center gap-3 py-4 px-4">
                {saving ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Upload className="h-5 w-5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">Importar CSV</p>
                  <p className="text-xs text-muted-foreground">data, nome, descri\u00e7\u00e3o</p>
                </div>
                <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
              </CardContent>
            </Card>
            <Button
              variant="outline"
              className="h-auto px-4 flex flex-col items-center gap-1 py-4"
              onClick={() => downloadCSV(eventos)}
              disabled={eventos.length === 0}
            >
              <Download className="h-5 w-5" />
              <span className="text-xs">Exportar CSV</span>
            </Button>
          </div>
        ) : (
          eventos.length > 0 && (
            <Button
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={() => downloadCSV(eventos)}
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          )
        )}

        {eventos.length > 0 && (
          <div className="flex gap-2">
            <Badge variant="secondary">{eventos.length} evento(s) no calend\u00e1rio</Badge>
            {!podeEditar && (
              <Badge variant="outline" className="flex items-center gap-1 text-muted-foreground">
                <Lock className="h-3 w-3" /> Somente leitura
              </Badge>
            )}
          </div>
        )}

        {/* Calend\u00e1rio */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {format(mesSelecionado, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase())}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Carregando...
              </div>
            ) : (
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
                  temEvento:
                    "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1.5 after:h-1.5 after:rounded-full after:bg-primary",
                }}
                className="w-full"
              />
            )}
          </CardContent>
        </Card>

        {/* Lista de eventos do m\u00eas */}
        {eventosMes.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Eventos do m\u00eas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {eventosMes.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-3 rounded-lg p-3 border border-border hover:bg-muted transition-colors"
                >
                  <button
                    className="flex-1 text-left flex items-start gap-3"
                    onClick={() => {
                      setEventosDoDia(eventos.filter((e) => e.data === ev.data));
                      setDiaModal(parseISO(ev.data));
                    }}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-md bg-primary/10 flex flex-col items-center justify-center">
                      <span className="text-xs font-bold text-primary leading-none">
                        {format(parseISO(ev.data), "dd")}
                      </span>
                      <span className="text-[10px] text-primary/70 uppercase leading-none">
                        {format(parseISO(ev.data), "MMM", { locale: ptBR })}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{ev.nome}</p>
                      {ev.descricao && (
                        <p className="text-xs text-muted-foreground line-clamp-1">{ev.descricao}</p>
                      )}
                    </div>
                  </button>
                  {podeEditar && (
                    <button
                      onClick={() => setDeleteId(ev.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      title="Remover evento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!loading && eventos.length === 0 && (
          <div className="text-center py-10 text-muted-foreground">
            <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum evento ainda.</p>
            {podeEditar && <p className="text-xs mt-1">Adicione manualmente ou importe um CSV.</p>}
          </div>
        )}
      </div>

      {/* Modal: detalhe do dia */}
      <Dialog open={!!diaModal} onOpenChange={(o) => !o && setDiaModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {diaModal && format(diaModal, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          {eventosDoDia.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum evento neste dia.</p>
          ) : (
            <div className="space-y-3 mt-2">
              {eventosDoDia.map((ev) => (
                <div key={ev.id} className="rounded-lg border border-border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm">{ev.nome}</p>
                    {podeEditar && (
                      <button
                        onClick={() => setDeleteId(ev.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {ev.descricao && (
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ev.descricao}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" className="w-full mt-2" onClick={() => setDiaModal(null)}>
            <X className="h-4 w-4 mr-1" /> Fechar
          </Button>
        </DialogContent>
      </Dialog>

      {/* Modal: adicionar evento (s\u00f3 coordenador/admin) */}
      {podeEditar && (
        <Dialog open={addModal} onOpenChange={setAddModal}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Novo evento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1">
                <Label htmlFor="add-data">Data</Label>
                <Input id="add-data" type="date" value={addData} onChange={(e) => setAddData(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-nome">Nome do evento</Label>
                <Input id="add-nome" placeholder="Ex: Aula de Catequese" value={addNome} onChange={(e) => setAddNome(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-desc">Descri\u00e7\u00e3o (opcional)</Label>
                <Textarea id="add-desc" placeholder="Ex: Tema: Os Sacramentos" value={addDesc} onChange={(e) => setAddDesc(e.target.value)} rows={3} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setAddModal(false)}>Cancelar</Button>
                <Button className="flex-1" onClick={handleAddEvento} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Salvar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Alert: confirmar exclus\u00e3o */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta a\u00e7\u00e3o n\u00e3o pode ser desfeita. O evento ser\u00e1 removido para todos os catequistas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
