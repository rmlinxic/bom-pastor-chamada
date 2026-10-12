# Implantação de Auth, RLS e recuperação por e-mail

Este roteiro é um requisito de implantação; não certifica que o projeto remoto já esteja configurado. Valide o projeto Supabase que corresponde à URL do frontend antes de aplicar alterações.

## Configuração do Auth e dos e-mails

O acesso ao aplicativo usa usuário e senha. Mantenha o provedor interno de senha habilitado e o cadastro público bloqueado (`auth.enable_signup=false`, `auth.email.enable_signup=true`). A aplicação não exige comprimento ou composição da senha. As Edge Functions validam o usuário e derivam a credencial interna antes de usar Supabase Auth; nunca exponha o segredo `APP_PASSWORD_PEPPER`. Criar uma identidade Auth sem perfil ativo vinculado não concede acesso aos dados.

Configure:

| Configuração | Valor de produção |
| --- | --- |
| Auth Site URL | `https://rmlinxic.github.io/bom-pastor-chamada/` |
| Auth Redirect URL permitida | `https://rmlinxic.github.io/bom-pastor-chamada/#/redefinir-senha` |
| Edge Function `APP_URL` | `https://rmlinxic.github.io/bom-pastor-chamada/` |

Use o caminho exato de produção, evitando curingas amplos. Para desenvolvimento, permita separadamente `http://localhost:8080/#/redefinir-senha`. Alterações de domínio/base path exigem atualizar Auth, `APP_URL`, build e templates. [Referência oficial de redirects](https://supabase.com/docs/guides/auth/redirect-urls).

A recuperação e o acesso por e-mail estão em espera por decisão do responsável. Para ativá-los futuramente, configure SMTP próprio com remetente/domínio validado e credenciais apenas no servidor. Confira os templates de convite e recuperação: o link precisa usar a URL de confirmação gerada pelo Auth e preservar o redirecionamento. Desative rastreamento de links no provedor de e-mail se ele reescrever links de autenticação. Teste a entrega a um destinatário autorizado real, além de spam/quarentena. [SMTP](https://supabase.com/docs/guides/auth/auth-smtp) e [templates](https://supabase.com/docs/guides/auth/auth-email-templates).

Não compartilhe links completos de recuperação: eles contêm credenciais temporárias. Use URLs sem tokens e dados fictícios em registros e capturas compartilhadas.

## Banco e servidor

Revise o esquema real e um backup restrito; o repositório não tem baseline completo para um reset seguro. Aplique e teste as alterações de segurança em staging antes de produção. Migrações antigas que voltam a criar políticas abertas não podem ser reaplicadas depois da migração de acesso autenticado.

A autorização usa o UUID verificado do Auth e o perfil ativo do banco. O catequista acessa seus alunos ou vínculos legados de mesma etapa/paróquia; a coordenação acessa a própria paróquia; o administrador tem acesso global. Perfis, hashes legados e tabelas de tokens não podem ter grants públicos. A alteração de etapa é o único campo de perfil permitido diretamente ao coordenador/administrador pelo navegador; outras mudanças de conta passam pela Edge Function.

A função `account-management` verifica identidade e perfil antes de usar a chave de serviço. Configure `APP_URL` e mantenha a verificação de JWT do gateway compatível com o projeto, além da verificação interna com Auth. A chave de serviço e credenciais SMTP nunca entram no frontend, nos secrets `VITE_*`, no repositório ou em capturas compartilhadas. Consulte o [guia da função](../supabase/functions/account-management/README.md).

Provisione o primeiro administrador por um procedimento restrito de servidor. Confirme identidade, e-mail e o vínculo único antes de liberar seu login. Os demais perfis existentes mantêm suas senhas e migram no próximo login; novos perfis recebem usuário e senha no cadastro. Não publique endpoints de bootstrap e não reutilize hashes legados como autenticação.

O calendário histórico sem `paroquia_id` é global: a migração permite leitura a perfis ativos e restringe escrita ao administrador. Se houver a coluna de paróquia, as políticas usam o escopo correspondente.

## Justificativa pública e arquivos históricos

O visitante não lê listas de alunos nem escreve diretamente nas tabelas. O RPC de justificativa valida nome completo, contato normalizado cadastrado, paróquia, tamanho dos campos e intervalo de datas. A resposta é neutra para não revelar correspondências. Existe limite de tentativas por contato/paróquia; isso não equivale a CAPTCHA nem comprova que o solicitante controla o telefone. Para uma prova de identidade do responsável, será necessária verificação adicional por canal confirmado.

Arquivos JSON de histórico e exportações de justificativas contêm dados de crianças e responsáveis. Armazene-os em local restrito, compartilhe somente com pessoas autorizadas e siga a política de retenção da paróquia. Abrir um JSON em modo de leitura não torna seus dados públicos nem substitui proteção do arquivo fora do app.

## Verificação antes da publicação

Execute `npm ci` e `npm run check`; execute também os testes da Edge Function indicados em seu README. Os testes SQL em `supabase/tests/authenticated_access.sql` verificam metadados; `supabase/tests/rls_behavior.sql` verifica permissões com dados fictícios dentro de uma transação revertida. Complete a validação com identidades Auth reais:

- Anônimo: nenhuma leitura/escrita de crianças, documentos, presenças, tokens ou logs; apenas paróquias ativas e o RPC limitado.
- Catequista: seus próprios alunos; negativas para outra turma/paróquia e para alterações de papel, vínculo Auth ou senha de terceiros.
- Coordenador: sua paróquia; negativas de acesso e administração entre paróquias.
- Perfil inativo ou sem vínculo: dados negados, inclusive usando uma sessão Auth ainda válida.
- Usuário e senha: login, migração legada, troca de senha com confirmação da senha atual e redefinição administrativa, sem e-mails.
- Ano letivo: arquivo iniciado antes das gravações, consulta histórica preservada, escolhas de catequistas aplicadas e tratamento de falha parcial.

Não trate uma aprovação de lint/build ou um teste simulado como confirmação dessas permissões remotas. A publicação do frontend no GitHub Pages é separada da publicação da Edge Function, SQL e configurações Auth/SMTP. Depois do push em `main`, acompanhe o workflow e verifique o site com uma conta de teste autorizada.

## Credenciais atuais

As funções usam `APP_PUBLISHABLE_KEY`, `APP_SERVICE_KEY`, `APP_PASSWORD_PEPPER` e `APP_URL` apenas no servidor. A chave pública moderna é usada no frontend e no GitHub Actions; chaves legadas foram retiradas de uso. Preserve o segredo de derivação de senha: sua perda exige redefinir as credenciais dos perfis afetados. `scripts/smoke-test.mjs` testa o login e a alteração de senha no servidor com perfis fictícios e limpa os dados criados.
