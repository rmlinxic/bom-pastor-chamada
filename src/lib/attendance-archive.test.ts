import { describe, expect, it } from "vitest";
import { buildAttendanceArchive, parseAttendanceArchive } from "./attendance-archive";
const input = () => ({
  year: 2024, paroquiaId: "parish", catequistas: [],
  students: [{ id: "student", name: "Ana", class_name: "Primeira Etapa A", paroquia_id: "parish", paroquias: { nome: "Paróquia" } }],
  attendance: [{ id: "record", student_id: "student", date: "2024-02-29", status: "falta_justificada", justification_reason: "Consulta\nmédica" }],
  massAttendance: [{ id: "mass", student_id: "student", date: "2024-02-29" }],
});
describe("annual attendance archives", () => {
  it("preserves original class, year and complete reasons after live promotion", () => {
    const live = input();
    const saved = JSON.stringify(buildAttendanceArchive(live));
    live.students[0].class_name = "Segunda Etapa A";
    const archive = parseAttendanceArchive(saved);
    expect(archive.year).toBe(2024);
    expect(archive.students[0].class_name).toBe("Primeira Etapa A");
    expect(archive.attendance[0].students?.class_name).toBe("Primeira Etapa A");
    expect(archive.attendance[0].justification_reason).toBe("Consulta\nmédica");
    expect(archive.massAttendance[0].date).toBe("2024-02-29");
  });
  it.each(["2024-02-30", "2024-04-31", "2024-13-01", "2023-02-29", "2025-01-01"])("rejects impossible or out-of-year date %s", (date) => {
    const archive = input(); archive.attendance[0].date = date;
    expect(() => parseAttendanceArchive(JSON.stringify(buildAttendanceArchive(archive)))).toThrow();
  });
  it("rejects mass dates and records for children outside the archived roster", () => {
    const archive = input(); archive.massAttendance[0].date = "2024-02-30";
    expect(() => parseAttendanceArchive(JSON.stringify(buildAttendanceArchive(archive)))).toThrow();
    archive.massAttendance[0].date = "2024-02-29"; archive.attendance[0].student_id = "unknown";
    expect(() => parseAttendanceArchive(JSON.stringify(buildAttendanceArchive(archive)))).toThrow();
  });
  it("rejects unknown format, unsupported version and invalid status", () => {
    const archive = buildAttendanceArchive(input());
    expect(() => parseAttendanceArchive(JSON.stringify({ ...archive, version: 2 }))).toThrow();
    expect(() => parseAttendanceArchive(JSON.stringify({ ...archive, format: "other" }))).toThrow();
    const invalidStatus = input();
    invalidStatus.attendance[0].status = "unknown";
    expect(() => parseAttendanceArchive(JSON.stringify(buildAttendanceArchive(invalidStatus)))).toThrow();
  });
});
