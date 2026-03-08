# Migração SQL — Sistema de Catequistas

Cole cada bloco no **Supabase Dashboard → SQL Editor** e execute em ordem.

---

## Passo 1 — Criar tabela de catequistas

```sql
CREATE TABLE catequistas (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'catequista'
                            CHECK (role IN ('admin', 'catequista')),
  etapa         TEXT,       -- turma gerenciada pelo catequista (NULL para admin)
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
```

---

## Passo 2 — Criar o administrador inicial

> Substitua `admin@suaparoquia.com` pelo seu e-mail e `SuaSenha@123` pela sua senha.
> O hash é SHA-256 com o prefixo interno `bom_pastor_catequese`.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO catequistas (name, email, password_hash, role)
VALUES (
  'Administrador',
  'admin@suaparoquia.com',
  encode(
    digest('bom_pastor_catequese' || 'SuaSenha@123', 'sha256'),
    'hex'
  ),
  'admin'
);
```

Após executar, faça login no sistema com o e-mail e senha acima.
Você pode criar novos catequistas no **Painel Admin** dentro do aplicativo.

---

## Notas de segurança

- As senhas são armazenadas como hash SHA-256 — nunca em texto puro.
- O painel Admin só é visível para usuários com `role = 'admin'`.
- Cada catequista acessa apenas os alunos e presenças da sua própria `etapa`.
- O administrador vê todos os dados de todas as turmas.
