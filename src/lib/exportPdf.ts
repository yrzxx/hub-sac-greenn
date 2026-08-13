import { jsPDF } from "jspdf";

interface DashboardPdfData {
  periodoLabel: string;
  totalAvaliacoes: number;
  porColaborador: {
    atendente: string;
    media: number | null;
    total: number;
    percentual: number | null;
    ultima: string;
  }[];
}

export function exportCsatDashboardToPdf(data: DashboardPdfData) {
  const doc = new jsPDF();
  const margemEsquerda = 14;
  let y = 20;

  doc.setFontSize(16);
  doc.text("Hub SAC Greenn — Dashboard de CSAT", margemEsquerda, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Período: ${data.periodoLabel}`, margemEsquerda, y);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margemEsquerda, y + 5);
  y += 14;

  doc.setTextColor(20);
  doc.setFontSize(12);
  doc.text(`Total de avaliações no período: ${data.totalAvaliacoes}`, margemEsquerda, y);
  y += 10;

  doc.setFontSize(11);
  doc.text("Desempenho por colaborador", margemEsquerda, y);
  y += 7;

  doc.setFontSize(9);
  const colunas = ["Colaborador", "Nota média", "Avaliações", "Satisfação", "Última avaliação"];
  const larguras = [55, 30, 30, 30, 40];
  let x = margemEsquerda;
  colunas.forEach((c, i) => {
    doc.text(c, x, y);
    x += larguras[i];
  });
  y += 5;
  doc.line(margemEsquerda, y - 3, x, y - 3);

  data.porColaborador.forEach((c) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    x = margemEsquerda;
    const valores = [
      c.atendente,
      c.media !== null ? c.media.toFixed(1) : "—",
      String(c.total),
      c.percentual !== null ? `${c.percentual.toFixed(0)}%` : "—",
      new Date(c.ultima).toLocaleDateString("pt-BR"),
    ];
    valores.forEach((v, i) => {
      doc.text(String(v), x, y);
      x += larguras[i];
    });
    y += 6;
  });

  doc.save(`csat-dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
}
