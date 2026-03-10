/**
 * Fonte única das etapas do programa catequético.
 * Usada em AnoLetivo, CoordinadorView, StudentForm, Admin e Missas.
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

/** Retorna a próxima etapa na sequência, ou a própria se for a última */
export function proximaEtapa(etapa: string): string {
  const idx = ETAPAS.indexOf(etapa as Etapa);
  if (idx === -1 || idx === ETAPAS.length - 1) return etapa;
  return ETAPAS[idx + 1];
}
