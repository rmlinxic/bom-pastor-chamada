import { describe, expect, it } from "vitest";

import { nomeTurma, parseTurma, proximaEtapa } from "./etapas";

describe("regras de etapas", () => {
  it("monta nomes de turma com sufixo opcional", () => {
    expect(nomeTurma("Primeira Etapa", "A")).toBe("Primeira Etapa A");
    expect(nomeTurma("Crisma")).toBe("Crisma");
  });

  it("separa a etapa e o sufixo da turma", () => {
    expect(parseTurma("Segunda Etapa B")).toEqual({
      etapa: "Segunda Etapa",
      turma: "B",
    });
    expect(parseTurma("Crisma")).toEqual({ etapa: "Crisma", turma: "" });
  });

  it("avança para a próxima etapa sem carregar o sufixo", () => {
    expect(proximaEtapa("Primeira Etapa A")).toBe("Segunda Etapa");
    expect(proximaEtapa("Crisma B")).toBe("Crisma");
  });
});
