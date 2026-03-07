# ⚙️ Configuração do Supabase — Catequese Bom Pastor

Este guia explica como configurar o banco de dados Supabase para que o app funcione completamente.

> **Boas notícias:** o arquivo `.env` do projeto já tem as credenciais preenchidas (URL e chave anon do projeto Supabase). Você só precisa **criar as tabelas no banco de dados** rodando as migrations.

---

## Pré-requisitos

- Conta no [Supabase](https://supabase.com) (gratuita)
- O projeto Supabase já foi criado automaticamente pelo Lovable
- Credenciais já estão no arquivo `.env`:
  ```
  VITE_SUPABASE_URL="https://solqfhhkgrkxkfrqpftb.supabase.co"
  VITE_SUPABASE_PUBLISHABLE_KEY="eyJ..."
  ```

---

## Opção 1 — Via Dashboard (mais fácil, sem instalar nada)

### Passo 1: Acessar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e faça login
2. No painel, localize o projeto **`solqfhhkgrkxkfrqpftb`** (ou pelo nome que aparece)
3. Clique no projeto para abri-lo

### Passo 2: Abrir o SQL Editor

1. No menu lateral esquerdo, clique em **"SQL Editor"**
2. Clique em **"New query"** (botão verde ou `+`)

### Passo 3: Rodar as migrations na ordem

Copie e cole cada bloco SQL abaixo e clique em **"Run"** (ou `Ctrl+Enter`) após cada um.

---

#### 🟦 Migration 1 — Criar as tabelas

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
  class TEXT NOT NULL,
  guardian_name TEXT NOT NULL,
  guardian_contact TEXT NOT NULL,
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
  status TEXT NOT NULL CHECK (status IN ('present', 'justified_absence', 'unjustified_absence')),
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
CREATE INDEX idx_attendance_status ON public.attendance(status);
CREATE INDEX idx_students_class ON public.students(class);
```

---

#### 🟦 Migration 2 — Renomear colunas e atualizar status

```sql
-- Renomear colunas para o padrão do app
ALTER TABLE public.students RENAME COLUMN "class" TO class_name;
ALTER TABLE public.students RENAME COLUMN guardian_name TO parent_name;
ALTER TABLE public.students RENAME COLUMN guardian_contact TO phone;
```

---

#### 🟦 Migration 3 — Corrigir constraint de status (IMPORTANTE)

```sql
-- Atualizar constraint para usar os valores em português
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_status_check;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_status_check
  CHECK (status IN ('presente', 'falta_justificada', 'falta_nao_justificada'));

-- Corrigir índice renomeado
DROP INDEX IF EXISTS idx_students_class;
CREATE INDEX IF NOT EXISTS idx_students_class_name ON public.students(class_name);
```

---

### Passo 4: Verificar se as tabelas foram criadas

1. No menu lateral, clique em **"Table Editor"**
2. Você deve ver duas tabelas: **`students`** e **`attendance`**
3. Se aparecerem, está tudo certo! ✅

---

## Opção 2 — Via Supabase CLI (para devs)

Se preferir usar o terminal:

```bash
# 1. Instalar a CLI (caso não tenha)
npm install -g supabase

# 2. Fazer login
supabase login

# 3. Linkar ao projeto (use o Project ID do .env)
supabase link --project-ref solqfhhkgrkxkfrqpftb

# 4. Rodar todas as migrations automaticamente
supabase db push
```

---

## Rodando o projeto localmente

Após configurar o banco de dados:

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar o servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:5173` no navegador.

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
| `created_at` | TIMESTAMP | Data de cadastro |
| `updated_at` | TIMESTAMP | Última atualização |

### Tabela `attendance`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | UUID | Chave primária |
| `student_id` | UUID | FK → `students.id` |
| `date` | DATE | Data da aula (`YYYY-MM-DD`) |
| `status` | TEXT | `'presente'`, `'falta_justificada'` ou `'falta_nao_justificada'` |
| `justification_reason` | TEXT | Motivo da justificativa (opcional) |
| `created_at` | TIMESTAMP | Data do registro |
| `updated_at` | TIMESTAMP | Última atualização |

---

## Segurança (Row Level Security)

O banco usa **RLS (Row Level Security)** ativado, mas com políticas abertas (`USING (true)`) para facilitar o uso sem autenticação. Isso significa que **qualquer pessoa com a URL do app pode ler e escrever dados**.

Se quiser restringir o acesso no futuro, você precisará:
1. Adicionar autenticação no app (ex: login com e-mail/senha via Supabase Auth)
2. Atualizar as políticas RLS para exigir `auth.uid() IS NOT NULL`

---

## Problemas comuns

**Erro: "relation students does not exist"**
→ As migrations não foram rodadas. Siga o Passo 3 acima.

**Erro: "new row violates check constraint"**
→ A Migration 3 não foi rodada. Execute o SQL da Migration 3.

**Dados não aparecem no app**
→ Verifique se o arquivo `.env` existe na raiz do projeto com as três variáveis preenchidas.

**Erro de CORS ou "Invalid API key"**
→ Confirme que `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env` são os mesmos do seu projeto Supabase (Settings → API).
