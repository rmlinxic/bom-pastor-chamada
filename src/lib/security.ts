/**
 * Módulo de segurança centralizado
 * - Rate limiting de login (brute-force protection)
 * - Expiração de sessão por inatividade
 * - Sanitização de inputs
 */

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const RATE_LIMIT_KEY = "bp_rl_";
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos

interface RateLimitEntry {
  attempts: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

export function getRateLimitEntry(username: string): RateLimitEntry {
  try {
    const raw = sessionStorage.getItem(RATE_LIMIT_KEY + username);
    return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: null, lastAttempt: 0 };
  } catch {
    return { attempts: 0, lockedUntil: null, lastAttempt: 0 };
  }
}

export function recordFailedAttempt(username: string): RateLimitEntry {
  const entry = getRateLimitEntry(username);
  const now = Date.now();

  // Reset se o lockout já expirou
  if (entry.lockedUntil && now > entry.lockedUntil) {
    const reset = { attempts: 1, lockedUntil: null, lastAttempt: now };
    sessionStorage.setItem(RATE_LIMIT_KEY + username, JSON.stringify(reset));
    return reset;
  }

  const updated: RateLimitEntry = {
    attempts: entry.attempts + 1,
    lockedUntil: entry.attempts + 1 >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null,
    lastAttempt: now,
  };
  sessionStorage.setItem(RATE_LIMIT_KEY + username, JSON.stringify(updated));
  return updated;
}

export function clearRateLimit(username: string) {
  sessionStorage.removeItem(RATE_LIMIT_KEY + username);
}

export function isLockedOut(username: string): { locked: boolean; remainingMs: number } {
  const entry = getRateLimitEntry(username);
  if (!entry.lockedUntil) return { locked: false, remainingMs: 0 };
  const remaining = entry.lockedUntil - Date.now();
  if (remaining <= 0) {
    clearRateLimit(username);
    return { locked: false, remainingMs: 0 };
  }
  return { locked: true, remainingMs: remaining };
}

export function formatLockoutTime(ms: number): string {
  const minutes = Math.ceil(ms / 60000);
  return `${minutes} minuto${minutes !== 1 ? "s" : ""}`;
}

// ─── Session Expiry ──────────────────────────────────────────────────────────

const SESSION_META_KEY = "bp_session_meta";
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000;    // 2 horas de inatividade

interface SessionMeta {
  createdAt: number;
  lastActivity: number;
}

export function initSessionMeta() {
  const meta: SessionMeta = { createdAt: Date.now(), lastActivity: Date.now() };
  sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
}

function readSessionMeta(): SessionMeta | null {
  try {
    const raw = sessionStorage.getItem(SESSION_META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
    const { createdAt, lastActivity } = meta;
    if (!Number.isFinite(createdAt) || !Number.isFinite(lastActivity)) return null;
    if (createdAt < 0 || lastActivity < createdAt || lastActivity > Date.now()) return null;
    return { createdAt, lastActivity };
  } catch {
    return null;
  }
}

function hasExpired(meta: SessionMeta): boolean {
  const now = Date.now();
  return now - meta.createdAt >= SESSION_TIMEOUT_MS || now - meta.lastActivity >= IDLE_TIMEOUT_MS;
}

export function touchSession() {
  try {
    const meta = readSessionMeta();
    if (!meta || hasExpired(meta)) return;
    meta.lastActivity = Date.now();
    sessionStorage.setItem(SESSION_META_KEY, JSON.stringify(meta));
  } catch { /* ignore */ }
}

export function isSessionExpired(): boolean {
  const meta = readSessionMeta();
  return !meta || hasExpired(meta);
}

export function clearSessionMeta() {
  sessionStorage.removeItem(SESSION_META_KEY);
}

// ─── Input Sanitization ──────────────────────────────────────────────────────

/** Remove caracteres de controle e limita tamanho */
export function sanitizeText(value: string, maxLength = 255): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (code >= 32 || code === 9 || code === 10 || code === 13) && code !== 127;
    })
    .join("")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;")         // basic XSS
    .trim()
    .slice(0, maxLength);
}

/** Sanitiza username: apenas letras, números, underscores, hifens */
export function sanitizeUsername(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "").slice(0, 64);
}

/** Sanitiza telefone: apenas dígitos, espaços, +, -, parênteses */
export function sanitizePhone(value: string): string {
  return value.replace(/[^0-9\s+()-]/g, "").trim().slice(0, 20);
}

// ─── Password Strength ───────────────────────────────────────────────────────

export interface PasswordStrength {
  score: number;   // 0-4
  label: string;
  color: string;
  suggestions: string[];
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const suggestions: string[] = [];
  let score = 0;

  if (password.length >= 8) score++; else suggestions.push("Mínimo 8 caracteres");
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++; else suggestions.push("Adicione letras maiúsculas");
  if (/[0-9]/.test(password)) score++; else suggestions.push("Adicione números");
  if (/[^A-Za-z0-9]/.test(password)) score++; else suggestions.push("Adicione símbolos (!@#$)");

  const labels = ["Muito fraca", "Fraca", "Razoável", "Boa", "Forte"];
  const colors = ["text-destructive", "text-destructive", "text-warning", "text-warning", "text-success"];

  return { score: Math.min(score, 4), label: labels[Math.min(score, 4)], color: colors[Math.min(score, 4)], suggestions };
}
