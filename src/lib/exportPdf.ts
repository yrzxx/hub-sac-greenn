import { jsPDF } from "jspdf";
import type { DbRRHistory } from "@/types/database";

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

function renderRRHistorico(doc: jsPDF, titulo: string, usuarioNome: string, historico: DbRRHistory[]) {
  const margemEsquerda = 14;
  let y = 20;

  doc.setFontSize(16);
  doc.text(titulo, margemEsquerda, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Colaborador: ${usuarioNome}`, margemEsquerda, y);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margemEsquerda, y + 5);
  y += 14;

  historico.forEach((rr, i) => {
    if (i > 0) {
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setDrawColor(220);
      doc.line(margemEsquerda, y, 196, y);
      y += 8;
    }

    doc.setTextColor(20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(rr.periodo, margemEsquerda, y);
    doc.setFont("helvetica", "normal");
    y += 6;

    doc.setFontSize(9);
    doc.setTextColor(80);
    doc.text(
      `CSAT: ${rr.csat ?? "—"}   Atendimentos: ${rr.atendimentos ?? 0}   Tempo médio: ${rr.tempo_medio ?? "—"}   Meta: ${rr.meta_batida ? "batida" : "não atingida"}`,
      margemEsquerda,
      y
    );
    y += 8;

    const blocos: [string, string | null][] = [
      ["Aprendizados", rr.aprendizados],
      ["Dificuldades", rr.dificuldades],
      ["Plano de ação", rr.plano_de_acao],
      ["Objetivos", rr.objetivos],
    ];
    blocos.forEach(([label, texto]) => {
      if (!texto) return;
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setTextColor(20);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`${label}:`, margemEsquerda, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(60);
      const linhas: string[] = doc.splitTextToSize(texto, 180);
      linhas.forEach((linha) => {
        if (y > 280) { doc.addPage(); y = 20; }
        doc.text(linha, margemEsquerda + 2, y);
        y += 5;
      });
      y += 3;
    });
  });
}

export function exportRRHistoricoToPdf(usuarioNome: string, historico: DbRRHistory[]) {
  const doc = new jsPDF();
  renderRRHistorico(doc, "Hub SAC Greenn — Histórico de Reuniões de Resultados", usuarioNome, historico);
  doc.save(`rr-historico-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportRRUnicaToPdf(usuarioNome: string, rr: DbRRHistory) {
  const doc = new jsPDF();
  renderRRHistorico(doc, `Hub SAC Greenn — Reunião de Resultados`, usuarioNome, [rr]);
  doc.save(`rr-${rr.periodo.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
