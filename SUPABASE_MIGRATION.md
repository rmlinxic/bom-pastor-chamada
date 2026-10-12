# Migração de contas legadas para Supabase Auth

O modelo legado comparava hashes de senha no navegador e guardava o papel em armazenamento local. Isso não fornecia autorização no servidor. A versão atual usa Supabase Auth para identificar o usuário e políticas RLS para autorizar o perfil ativo vinculado por `catequistas.auth_user_id`.

## Preparação

Faça backup com acesso controlado e inventarie o banco real. O histórico de migrações ainda contém lacunas de baseline; não execute indiscriminadamente todas as migrações antigas em um banco vazio ou em produção. Consulte [Configuração](SUPABASE_SETUP.md) e [Implantação de segurança](docs/SECURITY_DEPLOYMENT.md).

Teste a migração de acesso autenticado em staging. Ela substitui políticas anteriores e retira grants anônimos dos dados dos alunos. Perfis não vinculados passam a não ter acesso, portanto a preparação do administrador e dos convites faz parte da transição. Não mantenha temporariamente `USING (true)` para contornar isso.

## Contas e convites

1. Um operador confiável provisiona o primeiro administrador no Supabase Auth e vincula seu UUID ao perfil administrativo correto por um procedimento restrito de servidor. Confira e-mail, papel e perfil antes do vínculo.
2. Publique a Edge Function `account-management` com a configuração de servidor, verificações de identidade e permissões descritas em seu [README](supabase/functions/account-management/README.md).
3. O administrador envia convites aos perfis legados pelo fluxo `admin_invite`. Cada conta exige e-mail individual e vínculo único; conflitos e cadastros parciais precisam de revisão administrativa.
4. O destinatário abre o convite, define sua senha e passa a entrar por e-mail. As senhas/hashes antigos não se tornam credenciais Auth.
5. Verifique o acesso de catequista, coordenador e administrador, incluindo negativas entre paróquias e contas inativas, antes de liberar a operação.

Nunca distribua uma senha administrativa compartilhada, faça o bootstrap pelo navegador ou aceite um papel enviado pelo cliente como autorização. A chave de serviço pertence somente ao servidor.

## Recuperação de senha

“Esqueci minha senha” solicita um link ao Supabase Auth. O link válido abre a página de redefinição, e a nova senha é enviada por `auth.updateUser`. A função legada `reset_password_by_email` e a tabela de tokens legados não devem ser acessíveis pelo navegador.

A troca de senha depende das configurações Auth, SMTP e callbacks reais. O sucesso de testes com mocks não comprova entrega de e-mail nem validade de um link remoto.

## Dados e transição de ano

A migração de acesso não apaga alunos, chamadas ou missas. O encerramento de ano preserva registros e inicia o download de um arquivo JSON antes das alterações; relatórios históricos podem abrir esse arquivo em leitura. Ele contém dados pessoais, e deve ser guardado com acesso restrito.

Mudanças de aluno, catequista, promoção e encerramento ainda são operações separadas. Uma falha parcial exige conferência antes de repetir; não existe garantia de transação única para o fluxo completo. Contas Auth e perfis administrados pela Edge Function também podem exigir reconciliação após falha parcial.
