/**
 * Fonte única das etapas do programa catequético.
 * Usada em Admin, AnoLetivo, CoordinadorView, StudentForm e Missas.
 */
export const ETAPAS = [
  "Primeira Etapa",
  "Segunda Etapa",
  "Terceira Etapa",
  "Quarta Etapa",
  "Quinta Etapa",
  "Crisma",
] as const;

export type Etapa = typeof ETAPAS[number];

/**
 * Sufixos de turma disponíveis quando há mais de um catequista na mesma etapa.
 * Podem ser combinados: A, B, C, ..., Z, AA, AB...
 */
export const TURMA_SUFIXOS = ["A","B","C","D","E","F","G","H"] as const;

/**
 * Monta o nome completo da turma: "Primeira Etapa" ou "Primeira Etapa A".
 * Se turma for vazio/undefined, retorna apenas a etapa.
 */
export function nomeTurma(etapa: string, turma?: string | null): string {
  return turma ? `${etapa} ${turma}` : etapa;
}

/**
 * Separa um nome de turma completo nos componentes etapa + sufixo.
 * "Primeira Etapa A" → { etapa: "Primeira Etapa", turma: "A" }
 * "Crisma"          → { etapa: "Crisma",         turma: "" }
 */
export function parseTurma(nomeCompleto: string): { etapa: string; turma: string } {
  for (const e of ETAPAS) {
    if (nomeCompleto === e) return { etapa: e, turma: "" };
    if (nomeCompleto.startsWith(e + " ")) {
      return { etapa: e, turma: nomeCompleto.slice(e.length + 1).trim() };
    }
  }
  // fallback: trata tudo como etapa sem sufixo
  return { etapa: nomeCompleto, turma: "" };
}

/** Retorna a próxima etapa na sequência, ou a própria se for a última.
 *  Ignora sufixo de turma ("Primeira Etapa A" → "Segunda Etapa"). */
export function proximaEtapa(nomeCompleto: string): string {
  const { etapa } = parseTurma(nomeCompleto);
  const idx = ETAPAS.indexOf(etapa as Etapa);
  if (idx === -1 || idx === ETAPAS.length - 1) return etapa;
  return ETAPAS[idx + 1];
}
