/**
 * Helpers de semana ISO em BRT (America/Sao_Paulo).
 *
 * Usado pelo Check-in Semanal / Otimização Semanal pra calcular janelas
 * comparativas (semana atual × anterior) sem cair em bugs de fuso.
 */

const TZ = "America/Sao_Paulo";

function brDate(d: Date = new Date()): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  return {
    y: +parts.find(p => p.type === "year")!.value,
    m: +parts.find(p => p.type === "month")!.value,
    d: +parts.find(p => p.type === "day")!.value,
  };
}

function dateAtBR(daysOffset: number): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + daysOffset * 86400_000);
  const { y, m, d } = brDate(shifted);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Retorna a janela "últimos 7 dias" (segunda → domingo da semana fechada
 * mais recente). Usado quando o check-in roda na segunda de manhã.
 */
export function lastWeekWindow(): { dateFrom: string; dateTo: string } {
  // últimos 7 dias terminando ontem (não incluir hoje)
  return {
    dateFrom: dateAtBR(-7),
    dateTo: dateAtBR(-1),
  };
}

/**
 * Janela da semana anterior à última (8-14 dias atrás). Usada pro
 * comparativo no Check-in.
 */
export function previousWeekWindow(): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: dateAtBR(-14),
    dateTo: dateAtBR(-8),
  };
}

/**
 * Semana ISO ("YYYY-Www") da data atual em BRT. Usada como chave de
 * registro na tabela weekly_checkins.
 */
export function isoWeekBR(): string {
  const { y, m, d } = brDate();
  // ISO week algorithm (Mon-Sun)
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
