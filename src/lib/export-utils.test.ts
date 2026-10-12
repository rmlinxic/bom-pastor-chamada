import { describe, expect, it } from "vitest";
import { csvText, escapeHtml, justificationRows } from "./export-utils";

describe("exportação de justificativas", () => {
  it("mantém data, aluno, turma e motivo completo", () => {
    expect(justificationRows([{ student_id: "s1", date: "2025-10-12", justification_reason: "Consulta\nmédica" }], { s1: { name: "Ana", class_name: "Primeira Etapa" } }))
      .toEqual([["2025-10-12", "Ana", "Primeira Etapa", "Consulta\nmédica"]]);
  });
  it("trata textos como conteúdo na impressão e protege CSV de fórmulas", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(csvText([["=1+1", "Ana, Maria", 'Consulta "médica"', -2]])).toBe('"\'=1+1","Ana, Maria","Consulta ""médica""","-2"');
  });
});
