# Bom Pastor — Presença na Catequese

Aplicação React/TypeScript para cadastro de catequizandos, chamadas, presença nas missas, justificativas, documentos, calendário e relatórios. O backend usa Supabase PostgreSQL, Supabase Auth e uma Edge Function para administrar contas.

**Site:** [Bom Pastor](https://rmlinxic.github.io/bom-pastor-chamada/). O endereço não comprova que a versão deste checkout ou as migrações já foram publicadas.

## Desenvolvimento

Use Node.js 20 e npm; `package-lock.json` é o lockfile canônico, também usado no CI.

```bash
npm ci
cp .env.example .env
npm run dev
```

Preencha `.env` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. O servidor local usa `http://localhost:8080`. Variáveis `VITE_*` aparecem no navegador: nunca inclua senha, chave `service_role`, chave secreta de servidor ou credenciais SMTP.

```bash
npm run typecheck
npm run test
npm run check
```

`check` executa lint, verificação TypeScript, testes e build. Os testes locais usam dados simulados; não demonstram que políticas, e-mails ou permissões do projeto remoto estejam corretos.

## Acesso e histórico

O login usa e-mail e senha do Supabase Auth. O perfil ativo de `catequistas` deve estar vinculado ao usuário Auth por `auth_user_id`. Contas existentes precisam de convite administrativo; senhas legadas não são convertidas automaticamente. A autorização efetiva depende das políticas RLS aplicadas ao banco, além dos controles da interface.

No encerramento de ano, a coordenação escolhe o catequista de cada etapa/subturma. Antes das mudanças, o app inicia o download de um arquivo JSON com o ano, as turmas, os alunos, as chamadas e as missas. As presenças permanecem no banco. Os relatórios permitem abrir um arquivo histórico em modo de leitura; o arquivo guarda os nomes e as turmas da época. Guarde-o em local de acesso controlado, pois contém dados de crianças e responsáveis. A interface não consegue confirmar que o navegador salvou o download.

A justificativa pública pede paróquia, nome completo do aluno e contato cadastrado do responsável. Não oferece uma lista pública de crianças. O envio é validado por uma função limitada no banco; detalhes de implantação estão no guia de segurança.

## Configuração e publicação

- [Configuração do Supabase](SUPABASE_SETUP.md): ambiente, esquema e contas.
- [Migração das contas e permissões](SUPABASE_MIGRATION.md): transição do modelo legado.
- [Implantação de segurança](docs/SECURITY_DEPLOYMENT.md): Auth, e-mail, RLS e verificações remotas.
- [Edge Function de contas](supabase/functions/account-management/README.md): ações, permissões e requisitos do servidor.

A pasta `supabase/migrations` contém alterações históricas, mas ainda não oferece um baseline completo e validado para criar um banco vazio. Não execute um reset ou todas as migrações às cegas para configurar produção.

O workflow `.github/workflows/deploy.yml` usa `npm ci`, valida o código e publica `dist` no GitHub Pages após um push em `main` ou execução manual. Configure os secrets de Actions `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. O deploy do site é separado das migrações SQL, da Edge Function e das configurações Auth/SMTP.
