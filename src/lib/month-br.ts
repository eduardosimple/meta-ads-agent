/**
 * Helpers de mês em BRT (America/Sao_Paulo).
 * Usado pela Otimização Mensal pra calcular janelas (mês fechado vs mês anterior).
 */
const TZ = "America/Sao_Paulo";

function brOf(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

/** Última janela de 30 dias terminando ontem em BRT. */
export function last30dWindow(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  return {
    dateFrom: brOf(new Date(now.getTime() - 30 * 86400_000)),
    dateTo: brOf(new Date(now.getTime() - 86400_000)),
  };
}

/** Janela do mês ANTERIOR ao último 30d (60 a 31 dias atrás) — pra comparativo. */
export function previous30dWindow(): { dateFrom: string; dateTo: string } {
  const now = new Date();
  return {
    dateFrom: brOf(new Date(now.getTime() - 60 * 86400_000)),
    dateTo: brOf(new Date(now.getTime() - 31 * 86400_000)),
  };
}

/** "YYYY-MM" do mês corrente em BRT — chave de monthly_optimizations. */
export function monthKeyBR(): string {
  return brOf(new Date()).slice(0, 7);
}
