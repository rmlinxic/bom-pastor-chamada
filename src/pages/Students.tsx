import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import PageHeader from "@/components/PageHeader";
import { useStudents, useAddStudent } from "@/hooks/useStudents";

export default function Students() {
  const { data: students = [] } = useStudents();
  const addMutation = useAddStudent();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", class: "", guardian_name: "", guardian_contact: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.class.trim()) return;
    addMutation.mutate(form, {
      onSuccess: () => {
        setForm({ name: "", class: "", guardian_name: "", guardian_contact: "" });
        setOpen(false);
      },
    });
  };

  return (
    <div className="pb-24">
      <PageHeader title="Alunos" subtitle="Gerencie os catequizandos" />

      <div className="px-4 mb-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full h-12 text-base font-semibold">
              <UserPlus className="mr-2 h-5 w-5" />
              Novo Aluno
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-4 max-w-sm">
            <DialogHeader>
              <DialogTitle>Cadastrar Aluno</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome do Aluno</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="class">Turma</Label>
                <Input id="class" value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} placeholder="Ex: Crisma 2025" required />
              </div>
              <div>
                <Label htmlFor="guardian">Nome do Responsável</Label>
                <Input id="guardian" value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} required />
              </div>
              <div>
                <Label htmlFor="contact">Contato</Label>
                <Input id="contact" value={form.guardian_contact} onChange={(e) => setForm({ ...form, guardian_contact: e.target.value })} placeholder="(99) 99999-9999" required />
              </div>
              <Button type="submit" className="w-full h-12" disabled={addMutation.isPending}>
                {addMutation.isPending ? "Salvando..." : "Cadastrar"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2 px-4">
        {students.map((s) => (
          <div key={s.id} className="rounded-lg border border-border bg-card p-4 shadow-sm animate-fade-in">
            <p className="font-semibold text-foreground">{s.name}</p>
            <p className="text-sm text-primary font-medium">{s.class}</p>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span>Resp: {s.guardian_name}</span>
              <span>{s.guardian_contact}</span>
            </div>
          </div>
        ))}

        {students.length === 0 && (
          <p className="py-8 text-center text-muted-foreground">
            Nenhum aluno cadastrado ainda.
          </p>
        )}
      </div>
    </div>
  );
}
