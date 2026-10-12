export function assertPasswordProvided(password: string): void {
  if (!password) throw new Error("Informe uma senha.");
}
