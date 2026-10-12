# Configuração do Supabase

Este guia descreve a configuração atual. Ele substitui o roteiro antigo com tabelas divergentes e políticas abertas. As configurações remotas e os e-mails precisam ser verificados no projeto correto antes da publicação.

## Ambiente do frontend

Copie `.env.example` para `.env` e configure:

```dotenv
VITE_SUPABASE_URL="https://SEU_PROJECT_ID.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sua-chave-publica"
```

O cliente lê exatamente esses nomes. `VITE_SUPABASE_ANON_KEY` não é a variável usada pelo frontend. A chave pública não autoriza acesso por si só: RLS e grants devem restringir os dados no servidor. Nunca coloque a chave `service_role`, uma chave secreta, senhas ou credenciais SMTP em variáveis `VITE_*`.

Execute `npm ci`, `npm run dev` e acesse `http://localhost:8080`. Para verificar o checkout, execute `npm run check`.

## Banco e migrações

Confirme a organização, o projeto e o identificador da URL antes de qualquer operação remota. O valor histórico em `supabase/config.toml` não substitui essa verificação.

As migrações antigas não constituem um baseline completo: existem referências a `catequistas` antes de sua criação; `mass_attendance` tem definições históricas sobrepostas; faltam definições completas de documentos e calendário. Os tipos TypeScript gerados também não documentam todo o esquema usado pela aplicação. Não recrie o banco copiando o SQL antigo destes guias e não execute `db reset` em produção.

Para um projeto existente, obtenha um backup restrito, confira as tabelas, colunas, constraints, funções e políticas reais, e teste apenas as alterações necessárias em um ambiente isolado. As migrações de outubro de 2026 substituem acesso permissivo e vinculam os perfis ao Auth; a de acesso autenticado ignora algumas tabelas históricas ausentes e emite avisos, sem criar o baseline delas. Para um projeto novo, primeiro prepare e valide um baseline completo com essas estruturas.

As tabelas utilizadas incluem `paroquias`, `catequistas`, `students`, `attendance`, `mass_attendance`, `pending_justifications`, `documentos_catequizando`, `calendario_eventos`, `anos_catequeticos`, `promocoes_pendentes` e `activity_log`. Chamadas usam `presente`, `falta_justificada` e `falta_nao_justificada`.

## Auth, contas e e-mail

O login é por e-mail e senha no Supabase Auth. Cada pessoa autorizada precisa de um perfil ativo de `catequistas` ligado por `auth_user_id`. Desative cadastro público, confirme e-mails e configure senha mínima de oito caracteres no Auth. Contas não vinculadas permanecem sem acesso aos dados.

O primeiro administrador deve ser provisionado por um operador confiável no servidor e vinculado ao perfil correto; não existe bootstrap público no app. Depois, administradores enviam convites para contas novas ou legadas pela função `account-management`. Consulte [Migração](SUPABASE_MIGRATION.md).

Configure SMTP de produção, as URLs exatas de convite/recuperação e a Edge Function conforme [Implantação de segurança](docs/SECURITY_DEPLOYMENT.md). O envio por SMTP padrão tem restrições e não deve ser tratado como serviço de produção. [Documentação oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Diagnóstico

- Login aceito pelo Auth, mas conta não autorizada: confira o vínculo `auth_user_id`, `active` e as políticas; não abra as tabelas para resolver o erro.
- Tabela ou coluna ausente: compare o esquema real com a funcionalidade correspondente e complete o baseline em staging.
- Permissão negada: verifique Auth, papel, paróquia e RLS; erros após ativar segurança podem revelar consultas antigas que precisavam de ajustes.
- E-mail não chega ou link retorna ao lugar errado: confira SMTP, destinatário, templates, Site URL e a allowlist exata.

Não publique tokens, links de recuperação, senhas, dados de alunos ou chaves em logs de diagnóstico e capturas de tela compartilhadas.
