/**
 * Converte segundos em um formato compacto e legível.
 * Exemplos: 75 → "1min 15s" · 3600 → "1h" · 3725 → "1h 2min 5s"
 */
export function formatDuration(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) return "—";

  const total = Math.round(totalSeconds);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;

  const partes: string[] = [];
  if (h > 0) partes.push(`${h}h`);
  if (min > 0) partes.push(`${min}min`);
  if (s > 0 || partes.length === 0) partes.push(`${s}s`);

  return partes.join(" ");
}

/** Mesma formatação, mas a partir de um valor já em minutos (com casas decimais). */
export function formatDurationFromMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return "—";
  return formatDuration(totalMinutes * 60);
}
