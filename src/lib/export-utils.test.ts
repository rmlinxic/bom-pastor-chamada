import { describe, expect, it } from "vitest";
import { csvText, escapeHtml, justificationRows, worksheetName } from "./export-utils";

describe("exportação de justificativas", () => {
  it("mantém data, aluno, turma e motivo completo", () => {
    expect(justificationRows([{ student_id: "s1", date: "2025-10-12", justification_reason: "Consulta\nmédica" }], { s1: { name: "Ana", class_name: "Primeira Etapa" } }))
      .toEqual([["2025-10-12", "Ana", "Primeira Etapa", "Consulta\nmédica"]]);
  });
  it("trata textos como conteúdo na impressão e protege CSV de fórmulas", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(csvText([["=1+1", "Ana, Maria", 'Consulta "médica"', -2]])).toBe('"\'=1+1","Ana, Maria","Consulta ""médica""","-2"');
  });
  it("keeps worksheet names valid and unique after sanitization and truncation", () => {
    const used: string[] = [];
    for (const label of ["Turma/A", "Turma:A", "turma a", "x".repeat(40), "x".repeat(40), "[]:*?/\\", "'Nome'"]) {
      const name = worksheetName(label, used);
      expect(name.length).toBeGreaterThan(0);
      expect(name.length).toBeLessThanOrEqual(31);
      expect(name).not.toMatch(/[:\\/?*[\]]/);
      expect(used.map((item) => item.toLowerCase())).not.toContain(name.toLowerCase());
      used.push(name);
    }
  });
  it("protects CSV formulas hidden behind whitespace without truncating multiline reasons", () => {
    const csv = csvText([["  =HYPERLINK(\"bad\")", "Consulta\nmédica", "+SUM(A1)", "@formula"]]);
    expect(csv).toContain("'  =HYPERLINK");
    expect(csv).toContain("Consulta\nmédica");
    expect(csv).toContain("'+SUM(A1)");
    expect(csv).toContain("'@formula");
  });
});
