export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Segunda-feira da semana em que a data cai (semana começa na segunda). */
export function mondayOf(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Matriz de semanas (cada uma com 7 dias) cobrindo o mês, começando na segunda. */
export function buildMonthGrid(ano: number, mesIndex: number): Date[][] {
  const primeiroDia = new Date(ano, mesIndex, 1);
  const ultimoDia = new Date(ano, mesIndex + 1, 0);
  const inicioGrid = mondayOf(primeiroDia);
  const fimGrid = new Date(ultimoDia);
  const dowFim = fimGrid.getDay();
  fimGrid.setDate(fimGrid.getDate() + (dowFim === 0 ? 0 : 7 - dowFim));

  const semanas: Date[][] = [];
  let atual = new Date(inicioGrid);
  while (atual <= fimGrid) {
    const semana: Date[] = [];
    for (let i = 0; i < 7; i++) {
      semana.push(new Date(atual));
      atual.setDate(atual.getDate() + 1);
    }
    semanas.push(semana);
  }
  return semanas;
}

export const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export const DIAS_SEMANA_CURTO = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function formatDiaCompleto(d: Date): string {
  const texto = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
