# 🚀 Guia Completo: Supabase + Deploy no GitHub Pages

Este guia cobre tudo que você precisa fazer para colocar o app **100% funcional** hospedado em `https://rmlinxic.github.io/bom-pastor-chamada/`.

> ⚠️ **Importante:** As credenciais que estão no `.env` do projeto foram geradas automaticamente pelo **Lovable** e pertencem à conta deles. Você precisa criar o seu **próprio** projeto Supabase gratuito.

---

## Etapa 1 — Criar sua conta e projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e clique em **"Start your project"**
2. Crie uma conta (pode usar login com GitHub — mais rápido)
3. Clique em **"New project"**
4. Preencha:
   - **Name:** `bom-pastor-chamada` (ou qualquer nome)
   - **Database Password:** escolha uma senha forte e **guarde em local seguro**
   - **Region:** `South America (São Paulo)` — menor latência no Brasil
5. Clique em **"Create new project"** e aguarde ~2 minutos

---

## Etapa 2 — Criar as tabelas (rodar migrations)

1. No painel do Supabase, clique em **"SQL Editor"** no menu lateral
2. Clique em **"New query"**
3. Copie e cole o SQL abaixo e clique em **"Run"** (ou `Ctrl+Enter`)

```sql
-- Função para atualizar timestamp automático
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Tabela de alunos
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Anyone can insert students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update students" ON public.students FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete students" ON public.students FOR DELETE USING (true);

CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de chamadas
CREATE TABLE public.attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('presente', 'falta_justificada', 'falta_nao_justificada')),
  justification_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(student_id, date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view attendance" ON public.attendance FOR SELECT USING (true);
CREATE POLICY "Anyone can insert attendance" ON public.attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update attendance" ON public.attendance FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete attendance" ON public.attendance FOR DELETE USING (true);

CREATE TRIGGER update_attendance_updated_at
  BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_attendance_student_id ON public.attendance(student_id);
CREATE INDEX idx_attendance_date ON public.attendance(date);
CREATE INDEX idx_students_class_name ON public.students(class_name);
```

Se aparecer **"Success. No rows returned"**, as tabelas foram criadas. Confirme em **Table Editor** — você deve ver `students` e `attendance`.

---

## Etapa 3 — Copiar suas credenciais

1. No painel do Supabase, clique em **⚙️ Project Settings** (engrenagem no menu lateral)
2. Clique em **"API"**
3. Copie os dois valores:

| Campo | Onde usar |
|---|---|
| **Project URL** | `VITE_SUPABASE_URL` |
| **anon public** (em "Project API keys") | `VITE_SUPABASE_PUBLISHABLE_KEY` |

---

## Etapa 4 — Adicionar as credenciais ao GitHub (Secrets)

As credenciais **não devem ficar no código** (o `.env` atual é do Lovable). Vamos guardar como segredos do GitHub:

1. No seu repositório do GitHub, clique em **Settings**
2. No menu lateral esquerdo, vá em **Secrets and variables → Actions**
3. Clique em **"New repository secret"** e adicione os dois:

| Nome do Secret | Valor |
|---|---|
| `VITE_SUPABASE_URL` | Cole o Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Cole a chave anon public |

---

## Etapa 5 — Ativar o GitHub Pages

1. No repositório do GitHub, clique em **Settings**
2. No menu lateral, clique em **Pages**
3. Em **"Source"**, selecione **"GitHub Actions"**
4. Clique em **Save**

---

## Etapa 6 — Fazer o primeiro deploy

Após fazer o merge do PR com todas as correções, o GitHub Actions vai disparar automaticamente e publicar o site.

Você pode acompanhar em **Actions** no seu repositório. Quando o job terminar (geralmente 2–3 min), o app estará disponível em:

```
https://rmlinxic.github.io/bom-pastor-chamada/
```

Para disparar manualmente sem precisar de um novo commit: **Actions → "Deploy to GitHub Pages" → "Run workflow"**.

---

## Estrutura do banco de dados

### Tabela `students`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `name` | TEXT | Nome do aluno |
| `class_name` | TEXT | Turma (ex: "Crisma 2025") |
| `parent_name` | TEXT | Nome do responsável |
| `phone` | TEXT | Telefone do responsável |
| `active` | BOOLEAN | `true` = ativo, `false` = removido |

### Tabela `attendance`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `student_id` | UUID | FK → `students.id` |
| `date` | DATE | Data da aula (`YYYY-MM-DD`) |
| `status` | TEXT | `'presente'`, `'falta_justificada'` ou `'falta_nao_justificada'` |
| `justification_reason` | TEXT | Motivo da justificativa (opcional) |

---

## Problemas comuns

**Build falhou no GitHub Actions com erro de credenciais**
→ Verifique se os dois Secrets foram criados corretamente (Etapa 4). Os nomes devem ser exatos: `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

**App abre mas dados não carregam**
→ As tabelas não foram criadas. Execute o SQL da Etapa 2.

**Página em branco após deploy**
→ Verifique no GitHub Actions se o build passou sem erros.

**Erro "relation does not exist" no console do navegador**
→ Execute o SQL da Etapa 2 no Supabase.
