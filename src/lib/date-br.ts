/**
 * Helpers de data em fuso São Paulo (BRT/BRST).
 *
 * Por padrão, `new Date().toISOString().split("T")[0]` devolve a data em UTC,
 * o que causa rollover prematuro às 21h BRT (00h UTC) e cria relatórios com
 * a "data de amanhã" antes da meia-noite local. Usar BRT em tudo que é
 * user-facing (date do daily_reports, etc.).
 */
const TZ = "America/Sao_Paulo";

/** "YYYY-MM-DD" no fuso de São Paulo. */
export function todayBR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** "YYYY-MM-DD" N dias atrás no fuso de São Paulo. */
export function nDaysAgoBR(n: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - n * 24 * 60 * 60 * 1000));
}
