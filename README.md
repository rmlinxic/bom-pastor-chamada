# Bom Pastor — Sistema de Presença

Aplicação web para controle de presença de catequizandos da Paroquía Bom Pastor. Permite registro diário de chamadas, gerenciamento de alunos e geração de relatórios por turma, com backend em PostgreSQL via Supabase.

**Deploy:** [rmlinxic.github.io/bom-pastor-chamada](https://rmlinxic.github.io/bom-pastor-chamada/)

## Funcionalidades

- Registro de presença, falta e falta justificada por data e turma
- Cadastro, edição e remoção de alunos com histórico individual
- Dashboard com estatísticas de frequência e alerta para alunos com 3 ou mais faltas consecutivas
- Exportação de histórico filtrado por turma em CSV
- Portal externo para envio de justificativas pelos responsáveis

## Stack

| Tecnologia | Papel |
|---|---|
| React 18 + TypeScript | Framework UI |
| Vite | Bundler |
| Tailwind CSS + shadcn/ui | Interface e componentes |
| Supabase (PostgreSQL) | Banco de dados e API REST |
| TanStack Query | Cache e gerenciamento de estado assensíncrono |

## Configuração

Consulte o arquivo [`SUPABASE_SETUP.md`](./SUPABASE_SETUP.md) para instruções completas de criação das tabelas, configuração de políticas RLS e deploy no GitHub Pages.

```bash
# Instalar dependências
npm install

# Configurar variáveis de ambiente
cp .env.example .env
# Preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# Iniciar servidor local
npm run dev
# Acesso: http://localhost:8080
```

## Estrutura

```
src/
├── components/     # Componentes reutilizáveis
├── hooks/          # Lógica de dados (useStudents, useAttendance)
├── integrations/   # Cliente Supabase e tipos TypeScript
├── pages/          # Páginas da aplicação
└── lib/            # Utilitários
supabase/
└── migrations/     # Scripts SQL de criação do banco
```

## CI/CD

O deploy é executado automaticamente via GitHub Actions a cada push na branch `main`.
