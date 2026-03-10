import { useState } from "react";
import {
  ShieldCheck, UserPlus, Pencil, UserX, Eye, EyeOff,
  Crown, User, BookOpen, Building2, PlusCircle,
  ToggleLeft, ToggleRight, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import {
  useCatequistas, useCreateCatequista, useUpdateCatequista,
  useDeactivateCatequista, type Catequista,
} from "@/hooks/useCatequistas";
import { useParoquias, useCreateParoquia, useToggleParoquia } from "@/hooks/useParoquias";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;
type UserRole = "admin" | "catequista" | "coordenador";

type FormData = {
  name: string;
  username: string;
  password: string;
  role: UserRole;
  etapa: string;
  paroquia_id: string;
  is_coordenador: boolean;
};

const EMPTY_FORM: FormData = {
  name: "", username: "", password: "",
  role: "catequista", etapa: "", paroquia_id: "", is_coordenador: false,
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  catequista: "Catequista",
  coordenador: "Coordenador (apenas)",
};

const ROLE_ICONS: Record<UserRole, React.ReactNode> = {
  admin: <Crown className="h-4 w-4 text-warning shrink-0" />,
  catequista: <User className="h-4 w-4 text-primary shrink-0" />,
  coordenador: <MapPin className="h-4 w-4 text-secondary-foreground shrink-0" />,
};

export default function Admin() {
  const { data: catequistas = [], isLoading } = useCatequistas();
  const { data: paroquias = [], isLoading: loadingParoquias } = useParoquias();
  const createMutation = useCreateCatequista();
  const updateMutation = useUpdateCatequista();
  const deactivateMutation = useDeactivateCatequista();
  const createParoquiaMutation = useCreateParoquia();
  const toggleParoquiaMutation = useToggleParoquia();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [novaParoquia, setNovaParoquia] = useState("");
  const [savingParoquia, setSavingParoquia] = useState(false);

  const activeList = catequistas.filter((c) => c.active);

  const openCreate = () => { setEditingId(null); setForm(EMPTY_FORM); setShowPass(false); setOpen(true); };

  const openEdit = (c: Catequista) => {
    setEditingId(c.id);
    setForm({
      name: c.name, username: c.username, password: "",
      role: c.role, etapa: c.etapa ?? "",
      paroquia_id: c.paroquia_id ?? "",
      is_coordenador: c.is_coordenador,
    });
    setShowPass(false);
    setOpen(true);
  };

  const handleDeactivate = (c: Catequista) => {
    if (window.confirm(`Desativar "${c.name}" (@${c.username})?\n\nEle perderá o acesso imediatamente.`))
      deactivateMutation.mutate(c.id);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.username.trim()) return;
    if (!editingId && !form.password.trim()) return;
    setSaving(true);
    try {
      const etapaInput = form.etapa.trim();
      if (form.role === "catequista" && etapaInput) {
        const duplicate = activeList.find(
          (c) => c.role === "catequista" && c.id !== editingId &&
            c.paroquia_id === (form.paroquia_id || null) &&
            c.etapa?.toLowerCase() === etapaInput.toLowerCase()
        );
        if (duplicate) {
          const novoA = `${etapaInput} A`; const novoB = `${etapaInput} B`;
          const confirmed = window.confirm(
            `A etapa "${etapaInput}" já está atribuída a "${duplicate.name}".\n\n` +
            `Deseja dividir em subturmas?\n• "${duplicate.name}" → ${novoA}\n• "${form.name}" → ${novoB}`
          );
          if (!confirmed) { setSaving(false); return; }
          await db.from("catequistas").update({ etapa: novoA }).eq("id", duplicate.id);
          await db.from("students").update({ class_name: novoA }).eq("class_name", etapaInput);
          toast.success(`Turma dividida: "${novoA}" e "${novoB}"`);
          const payload = { ...form, etapa: novoB, paroquia_id: form.paroquia_id || null, is_coordenador: form.is_coordenador };
          if (editingId) await updateMutation.mutateAsync({ id: editingId, ...payload, newPassword: form.password || undefined });
          else await createMutation.mutateAsync({ ...payload });
          setOpen(false); return;
        }
      }
      const payload = {
        ...form,
        etapa: etapaInput || null,
        paroquia_id: form.paroquia_id || null,
        is_coordenador: form.role === "coordenador" ? true : form.is_coordenador,
      };
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...payload, newPassword: form.password || undefined });
      else await createMutation.mutateAsync({ ...payload });
      setOpen(false);
    } finally { setSaving(false); }
  };

  const handleCreateParoquia = async () => {
    if (!novaParoquia.trim()) return;
    setSavingParoquia(true);
    try { await createParoquiaMutation.mutateAsync(novaParoquia); setNovaParoquia(""); }
    finally { setSavingParoquia(false); }
  };

  const showParoquiaSelector = form.role === "catequista" || form.role === "coordenador";

  // Badge de função combinada
  const getRoleBadge = (c: Catequista) => {
    if (c.role === "catequista" && c.is_coordenador)
      return { label: "Catequista + Coord.", cls: "bg-primary/10 text-primary" };
    if (c.role === "coordenador")
      return { label: "Coordenador", cls: "bg-secondary/30 text-secondary-foreground" };
    if (c.role === "admin")
      return { label: "Admin", cls: "bg-warning/20 text-warning" };
    return { label: "Catequista", cls: "bg-primary/10 text-primary" };
  };

  return (
    <div className="pb-24">
      <PageHeader title="Painel Admin" subtitle="Gerencie paróquias, catequistas e coordenadores" />

      <Tabs defaultValue="usuarios" className="px-4">
        <TabsList className="w-full mb-4">
          <TabsTrigger value="usuarios" className="flex-1">Usuários</TabsTrigger>
          <TabsTrigger value="paroquias" className="flex-1">Paróquias</TabsTrigger>
        </TabsList>

        {/* ===== ABA USUÁRIOS ===== */}
        <TabsContent value="usuarios">
          <div className="mb-4">
            <Button className="w-full h-12 text-base font-semibold" onClick={openCreate}>
              <UserPlus className="mr-2 h-5 w-5" /> Novo Usuário
            </Button>
          </div>
          {isLoading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : (
            <div className="space-y-3">
              {activeList.length === 0 && <p className="py-8 text-center text-muted-foreground">Nenhum usuário cadastrado.</p>}
              {activeList.map((c) => {
                const badge = getRoleBadge(c);
                return (
                  <div key={c.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {ROLE_ICONS[c.role]}
                          <p className="font-semibold text-foreground truncate">{c.name}</p>
                          <span className={cn("shrink-0 text-xs px-2 py-0.5 rounded-full font-medium", badge.cls)}>{badge.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">@{c.username}</p>
                        {c.paroquia_nome ? (
                          <div className="flex items-center gap-1.5 mt-1"><Building2 className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">{c.paroquia_nome}</span></div>
                        ) : (c.role === "catequista" || c.role === "coordenador") ? (
                          <div className="flex items-center gap-1.5 mt-1"><Building2 className="h-3.5 w-3.5 text-destructive/60" /><span className="text-xs text-destructive/70 italic">Sem paróquia</span></div>
                        ) : null}
                        {c.etapa && (
                          <div className="flex items-center gap-1.5 mt-1"><BookOpen className="h-3.5 w-3.5 text-primary" /><span className="text-sm font-medium text-primary">{c.etapa}</span></div>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Editar"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDeactivate(c)} disabled={deactivateMutation.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10" title="Desativar">
                          <UserX className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeList.length > 0 && (
            <div className="mt-6 rounded-lg bg-muted/40 border border-border p-4">
              <div className="flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Resumo Geral</span></div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-card rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-primary">{activeList.filter((c) => c.role === "catequista").length}</p>
                  <p className="text-muted-foreground">Catequistas</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-secondary-foreground">{activeList.filter((c) => c.is_coordenador).length}</p>
                  <p className="text-muted-foreground">Coordenadores</p>
                </div>
                <div className="bg-card rounded-lg border border-border p-3 text-center">
                  <p className="text-2xl font-bold text-warning">{paroquias.filter((p) => p.ativa).length}</p>
                  <p className="text-muted-foreground">Paróquias</p>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===== ABA PARÓQUIAS ===== */}
        <TabsContent value="paroquias">
          <div className="mb-4 flex gap-2">
            <Input value={novaParoquia} onChange={(e) => setNovaParoquia(e.target.value)}
              placeholder="Nome da nova paróquia" onKeyDown={(e) => e.key === "Enter" && handleCreateParoquia()} />
            <Button onClick={handleCreateParoquia} disabled={savingParoquia || !novaParoquia.trim()}>
              <PlusCircle className="h-4 w-4 mr-1" /> Criar
            </Button>
          </div>
          {loadingParoquias ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : paroquias.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Nenhuma paróquia cadastrada.</p>
          ) : (
            <div className="space-y-3">
              {paroquias.map((p) => {
                const membros = activeList.filter((c) => c.paroquia_id === p.id);
                return (
                  <div key={p.id} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary shrink-0" />
                          <p className="font-semibold truncate">{p.nome}</p>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full", p.ativa ? "bg-success/20 text-success" : "bg-muted text-muted-foreground")}>
                            {p.ativa ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {membros.filter((c) => c.role === "catequista").length} catequistas ·{" "}
                          {membros.filter((c) => c.is_coordenador).length} coordenadores
                        </p>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => toggleParoquiaMutation.mutate({ id: p.id, ativa: !p.ativa })}>
                        {p.ativa ? <ToggleRight className="h-5 w-5 text-success" /> : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===== DIALOG ===== */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-w-sm">
          <DialogHeader><DialogTitle>{editingId ? "Editar Usuário" : "Novo Usuário"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome completo</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Maria Silva" />
            </div>
            <div>
              <Label>Nome de usuário</Label>
              <Input autoComplete="off" autoCapitalize="none" value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, "_") })}
                placeholder="Ex: maria_silva" />
            </div>
            <div>
              <Label>{editingId ? "Nova senha (opcional)" : "Senha"}</Label>
              <div className="relative">
                <Input type={showPass ? "text" : "password"} value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? "Nova senha (opcional)" : "Crie uma senha"} className="pr-10" />
                <button type="button" onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" tabIndex={-1}>
                  {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Função principal */}
            <div>
              <Label>Função</Label>
              <Select value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as UserRole, paroquia_id: "", etapa: "", is_coordenador: v === "coordenador" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="catequista">Catequista</SelectItem>
                  <SelectItem value="coordenador">Coordenador (apenas)</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Checkbox: catequista também coordena? */}
            {form.role === "catequista" && (
              <label className="flex items-center gap-3 cursor-pointer select-none rounded-lg border border-border bg-muted/30 px-3 py-3">
                <input
                  type="checkbox"
                  checked={form.is_coordenador}
                  onChange={(e) => setForm({ ...form, is_coordenador: e.target.checked })}
                  className="h-4 w-4 rounded accent-primary"
                />
                <div>
                  <p className="text-sm font-medium">Também é coordenador de paróquia</p>
                  <p className="text-xs text-muted-foreground">Terá acesso à visão de coordenador além da chamada</p>
                </div>
              </label>
            )}

            {/* Paróquia */}
            {showParoquiaSelector && (
              <div>
                <Label>Paróquia{!form.paroquia_id && <span className="ml-2 text-xs text-destructive font-normal">(obrigatório)</span>}</Label>
                {paroquias.filter((p) => p.ativa).length === 0 ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    Nenhuma paróquia ativa. Crie uma na aba "Paróquias" primeiro.
                  </div>
                ) : (
                  <Select value={form.paroquia_id} onValueChange={(v) => setForm({ ...form, paroquia_id: v })}>
                    <SelectTrigger className={cn(!form.paroquia_id && "border-destructive/50")}>
                      <SelectValue placeholder="Selecione a paróquia" />
                    </SelectTrigger>
                    <SelectContent>
                      {paroquias.filter((p) => p.ativa).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* Etapa */}
            {form.role === "catequista" && (
              <div>
                <Label>Etapa atribuída</Label>
                <Input value={form.etapa} onChange={(e) => setForm({ ...form, etapa: e.target.value })} placeholder="Ex: Crisma 2025" />
                <p className="text-xs text-muted-foreground mt-1">Se outra etapa igual já existir, o sistema divide em A e B.</p>
              </div>
            )}

            <Button className="w-full h-11" onClick={handleSave}
              disabled={saving || !form.name.trim() || !form.username.trim() || (!editingId && !form.password.trim())}>
              {saving ? <span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />Salvando...</span>
                : editingId ? "Salvar alterações" : "Criar usuário"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
