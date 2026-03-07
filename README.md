# ⛪ Catequese Bom Pastor — Sistema de Chamada

App web para controle de presença de catequizandos da Paróquia Bom Pastor.

## Funcionalidades

- 🗓️ **Chamada diária** — registre presença, falta ou falta justificada por data
- 👥 **Gerenciar alunos** — cadastrar, editar, remover e ver histórico por aluno
- 📊 **Dashboard** — painel com estatísticas e alerta de alunos com 3+ faltas
- 📄 **Relatórios** — histórico filtrado por turma com exportação em CSV
- 📝 **Portal de justificativa** — página externa para pais enviarem justificativas

## Tecnologias

- [React 18](https://react.dev) + [TypeScript](https://typescriptlang.org)
- [Vite](https://vitejs.dev) (bundler)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [Supabase](https://supabase.com) (banco de dados PostgreSQL + API)
- [TanStack Query](https://tanstack.com/query) (cache e gerenciamento de estado)

## Configuração

Veja o arquivo **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** para instruções completas de:
- Como criar sua conta gratuita no Supabase
- Como criar as tabelas no banco de dados
- Como configurar o deploy no GitHub Pages

## Rodando localmente

```bash
# 1. Instalar dependências
npm install

# 2. Copiar o arquivo de variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais do Supabase

# 3. Iniciar o servidor de desenvolvimento
npm run dev
```

Acesse `http://localhost:8080`

## Deploy

O deploy é feito automaticamente via **GitHub Actions** toda vez que você fizer push na branch `main`.

App em produção: `https://rmlinxic.github.io/bom-pastor-chamada/`

## Estrutura do projeto

```
src/
├── components/     # Componentes reutilizáveis (NavBar, Cards...)
├── hooks/          # Lógica de dados (useStudents, useAttendance...)
├── integrations/   # Cliente Supabase + tipos TypeScript
├── pages/          # Páginas da aplicação
└── lib/            # Utilitários
supabase/
└── migrations/     # Scripts SQL para criar o banco
```
