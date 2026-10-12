export type Role = "admin" | "catequista" | "coordenador";
export type Account = { id: string; role: Role; paroquia_id: string | null; is_coordenador: boolean; active: boolean; auth_user_id: string | null; email?: string | null };
export type ProfileInput = { name: string; username: string; email: string | null; role: Role; etapa: string | null; paroquia_id: string | null; is_coordenador: boolean };
export type Action =
  | { action: "set_mass_monitoring"; enabled: boolean }
  | { action: "set_password"; password: string; currentPassword?: string }
  | ({ action: "create"; password: string } & ProfileInput)
  | ({ action: "update"; id: string; newPassword?: string } & ProfileInput)
  | { action: "deactivate"; id: string };
export class ActionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ActionError(400, `${label} inválido.`);
  return value.trim();
}
function id(value: unknown): string {
  const result = text(value, "Identificador", 36);
  if (!uuid.test(result)) throw new ActionError(400, "Identificador inválido.");
  return result.toLowerCase();
}
function email(value: unknown): string | null {
  if (value == null || value === "") return null;
  const result = text(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new ActionError(400, "E-mail inválido.");
  return result;
}
function password(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !value) throw new ActionError(400, "Informe uma senha válida.");
  return value;
}
export function parseAction(value: unknown): Action {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActionError(400, "Solicitação inválida.");
  const input = value as Record<string, unknown>;
  const action = input.action;
  if (action === "set_mass_monitoring") {
    if (typeof input.enabled !== "boolean") throw new ActionError(400, "Preferência inválida.");
    return { action, enabled: input.enabled };
  }
  if (action === "set_password") {
    const chosenPassword = password(input.password);
    if (!chosenPassword) throw new ActionError(400, "Informe a nova senha.");
    return { action, password: chosenPassword, currentPassword: password(input.currentPassword) };
  }
  if (action === "deactivate") return { action, id: id(input.id) };
  if (action !== "create" && action !== "update") throw new ActionError(400, "Ação inválida.");
  if (!["admin", "catequista", "coordenador"].includes(String(input.role))) throw new ActionError(400, "Perfil inválido.");
  if (typeof input.is_coordenador !== "boolean") throw new ActionError(400, "Perfil de coordenação inválido.");
  const username = text(input.username, "Nome de usuário", 64).toLowerCase();
  if (!/^[a-z0-9_-]{3,64}$/.test(username)) throw new ActionError(400, "Nome de usuário inválido.");
  const role = input.role as Role;
  const profile: ProfileInput = {
    name: text(input.name, "Nome", 200), username, email: email(input.email), role,
    etapa: role === "catequista" && input.etapa != null ? text(input.etapa, "Etapa", 100) : null,
    paroquia_id: input.paroquia_id == null || input.paroquia_id === "" ? null : id(input.paroquia_id),
    is_coordenador: role === "coordenador" || input.is_coordenador,
  };
  if (role !== "admin" && !profile.paroquia_id) throw new ActionError(400, "Selecione uma paróquia.");
  if (action === "create") {
    const chosenPassword = password(input.password);
    if (!chosenPassword) throw new ActionError(400, "Informe a senha da nova conta.");
    return { action, ...profile, password: chosenPassword };
  }
  return { action, ...profile, id: id(input.id), newPassword: password(input.newPassword) };
}
export function authorizeAction(caller: Account, action: Action, target?: Account): void {
  if (!caller.active || !caller.auth_user_id) throw new ActionError(403, "Acesso não autorizado.");
  if (action.action === "set_password") return;
  if (action.action === "set_mass_monitoring") {
    if (caller.role !== "catequista") throw new ActionError(403, "Preferência disponível apenas para catequistas.");
    return;
  }
  if (caller.role === "admin") {
    if (target?.id === caller.id && (action.action === "deactivate" || (action.action === "update" && action.role !== "admin"))) throw new ActionError(403, "Não é possível remover seu próprio acesso administrativo.");
    return;
  }
  const coordinator = caller.role === "coordenador" || (caller.role === "catequista" && caller.is_coordenador);
  if (!coordinator || !caller.paroquia_id) throw new ActionError(403, "Acesso não autorizado.");
  if (target && (target.paroquia_id !== caller.paroquia_id || target.role !== "catequista" || target.is_coordenador || target.id === caller.id)) throw new ActionError(403, "Usuário fora do seu escopo de gerenciamento.");
  if (action.action === "update" && target && action.email !== (target.email?.trim().toLowerCase() || null)) {
    throw new ActionError(403, "Coordenadores não podem alterar o contato de e-mail de outro usuário.");
  }
  if (action.action === "create" || action.action === "update") {
    if (action.role !== "catequista" || action.is_coordenador || action.paroquia_id !== caller.paroquia_id || (action.action === "update" && action.newPassword)) throw new ActionError(403, "Coordenadores só podem gerenciar catequistas da própria paróquia, sem alterar privilégios ou senhas.");
  }
}
