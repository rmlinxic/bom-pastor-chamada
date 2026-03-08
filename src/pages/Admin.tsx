import { useState } from "react";
import {
  ShieldCheck,
  UserPlus,
  Pencil,
  UserX,
  Eye,
  EyeOff,
  Crown,
  User,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import {
  useCatequistas,
  useCreateCatequista,
  useUpdateCatequista,
  useDeactivateCatequista,
  type Catequista,
} from "@/hooks/useCatequistas";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const db = supabase as any;

type FormData = {
  name: string;
  email: string;
  password: string;
  role: "admin" | "catequista";
  etapa: string;
};

const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  password: "",
  role: "catequista",
  etapa: "",
};

export default function Admin() {
  const { data: catequistas = [], isLoading } = useCatequistas();
  const createMutation = useCreateCatequista();
  const updateMutation = useUpdateCatequista();
  const deactivateMutation = useDeactivateCatequista();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);

  const activeList = catequistas.filter((c) => c.active);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowPass(false);
    setOpen(true);
  };

  const openEdit = (c: Catequista) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      email: c.email,
      password: "",
      role: c.role,
      etapa: c.etapa ?? "",
    });
    setShowPass(false);
    setOpen(true);
  };

  const handleDeactivate = (c: Catequista) => {
    if (
      window.confirm(
        `Desativar o catequista "${c.name}"?\n\nEle perderá o acesso ao sistema imediatamente.`
      )
    ) {
      deactivateMutation.mutate(c.id);
    }
  };

  // Lógica de divisão A/B quando duas etapas são iguais
  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) return;
    if (!editingId && !form.password.trim()) return;

    setSaving(true);
    try {
      const etapaInput = form.etapa.trim();

      // Verificar duplicata de etapa (apenas para catequistas, não admins)
      if (form.role === "catequista" && etapaInput) {
        const duplicate = activeList.find(
          (c) =>
            c.role === "catequista" &&
            c.id !== editingId &&
            c.etapa?.toLowerCase() === etapaInput.toLowerCase()
        );

        if (duplicate) {
          const novoNomeA = `${etapaInput} A`;
          const novoNomeB = `${etapaInput} B`;

          const confirmed = window.confirm(
            `A etapa "${etapaInput}" já está atribuída a "${duplicate.name}".\n\n` +
              `Deseja dividir em subturmas automaticamente?\n\n` +
              `• "${duplicate.name}" → ${novoNomeA}\n` +
              `• "${form.name}" → ${novoNomeB}\n\n` +
              `Os alunos atuais de "${etapaInput}" serão mantidos na turma A.`
          );

          if (!confirmed) {
            setSaving(false);
            return;
          }

          // 1. Renomear etapa do catequista existente
          await db
            .from("catequistas")
            .update({ etapa: novoNomeA })
            .eq("id", duplicate.id);

          // 2. Renomear class_name dos alunos dessa etapa
          await supabase
            .from("students")
            .update({ class_name: novoNomeA })
            .eq("class_name", etapaInput);

          toast.success(
            `Turma dividida: "${novoNomeA}" (${duplicate.name}) e "${novoNomeB}" (${form.name})`
          );

          // Salvar com etapa B
          if (editingId) {
            await updateMutation.mutateAsync({
              id: editingId,
              ...form,
              etapa: novoNomeB,
              newPassword: form.password || undefined,
            });
          } else {
            await createMutation.mutateAsync({
              ...form,
              etapa: novoNomeB,
            });
          }
          setOpen(false);
          return;
        }
      }

      // Sem duplicata — salvar normalmente
      if (editingId) {
        await updateMutation.mutateAsync({
          id: editingId,
          ...form,
          etapa: etapaInput || null,
          newPassword: form.password || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          ...form,
          etapa: etapaInput || null,
        });
      }
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pb-24">
      <PageHeader
        title="Painel Admin"
        subtitle="Gerencie catequistas e etapas da paróquia"
      />

      {/* Botão novo catequista */}
      <div className="px-4 mb-6">
        <Button className="w-full h-12 text-base font-semibold" onClick={openCreate}>
          <UserPlus className="mr-2 h-5 w-5" />
          Novo Catequista
        </Button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {activeList.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              Nenhum catequista cadastrado ainda.
            </p>
          )}

          {activeList.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {c.role === "admin" ? (
                      <Crown className="h-4 w-4 text-warning shrink-0" />
                    ) : (
                      <User className="h-4 w-4 text-primary shrink-0" />
                    )}
                    <p className="font-semibold text-foreground truncate">{c.name}</p>
                    <span
                      className={cn(
                        "shrink-0 text-xs px-2 py-0.5 rounded-full font-medium",
                        c.role === "admin"
                          ? "bg-warning/20 text-warning"
                          : "bg-primary/10 text-primary"
                      )}
                    >
                      {c.role === "admin" ? "Administrador" : "Catequista"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                  {c.etapa && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <BookOpen className="h-3.5 w-3.5 text-primary" />
                      <span className="text-sm font-medium text-primary">
                        {c.etapa}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(c)}
                    title="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeactivate(c)}
                    disabled={deactivateMutation.isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Desativar"
                  >
                    <UserX className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumo */}
      {activeList.length > 0 && (
        <div className="mx-4 mt-6 rounded-lg bg-muted/40 border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">Resumo da Paróquia</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-card rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-primary">
                {activeList.filter((c) => c.role === "catequista").length}
              </p>
              <p className="text-muted-foreground">Catequistas</p>
            </div>
            <div className="bg-card rounded-lg border border-border p-3 text-center">
              <p className="text-2xl font-bold text-warning">
                {new Set(activeList.filter((c) => c.etapa).map((c) => c.etapa)).size}
              </p>
              <p className="text-muted-foreground">Etapas ativas</p>
            </div>
          </div>
          <div className="mt-3 space-y-1">
            {activeList
              .filter((c) => c.role === "catequista" && c.etapa)
              .map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <BookOpen className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{c.etapa}</span>
                  <span className="text-muted-foreground">— {c.name}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Diálogo criar / editar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="mx-4 max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Catequista" : "Novo Catequista"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome completo</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Maria Silva"
                required
              />
            </div>

            <div>
              <Label>E-mail de acesso</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="catequista@email.com"
                required
              />
            </div>

            <div>
              <Label>
                {editingId ? "Nova senha (deixe em branco para manter)" : "Senha"}
              </Label>
              <div className="relative">
                <Input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editingId ? "Nova senha (opcional)" : "Crie uma senha"}
                  required={!editingId}
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
              <Label>Função</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({ ...form, role: v as "admin" | "catequista" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="catequista">Catequista</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.role === "catequista" && (
              <div>
                <Label>Etapa atribuída</Label>
                <Input
                  value={form.etapa}
                  onChange={(e) => setForm({ ...form, etapa: e.target.value })}
                  placeholder="Ex: Crisma 2025, Etapa 1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Se outra etapa igual já existir, o sistema divide
                  automaticamente em A e B.
                </p>
              </div>
            )}

            <Button
              className="w-full h-11"
              onClick={handleSave}
              disabled={
                saving ||
                !form.name.trim() ||
                !form.email.trim() ||
                (!editingId && !form.password.trim())
              }
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground" />
                  Salvando...
                </span>
              ) : editingId ? (
                "Salvar alterações"
              ) : (
                "Criar catequista"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
