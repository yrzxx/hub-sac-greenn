import type { DbCsatResult } from "@/types/database";
import type { AtendimentoComMetricas } from "@/services/api";

export function exportCsatToCsv(rows: DbCsatResult[], filename = "csat.csv") {
  const header = [
    "Data",
    "Colaborador",
    "Canal",
    "Tópico",
    "Categoria do cliente",
    "Nota",
    "Classificação",
    "Tempo 1ª resposta (s)",
    "Tempo encerramento (s)",
    "Comentário",
  ];

  const linhas = rows.map((r) => [
    new Date(r.data_hora).toLocaleString("pt-BR"),
    r.users?.nome ?? r.atendente,
    r.canal ?? "",
    r.topico ?? "",
    r.categoria_cliente ?? "",
    r.nota ?? "",
    r.classificacao_csat ?? "",
    r.tempo_primeira_resposta_seg ?? "",
    r.tempo_encerramento_seg ?? "",
    (r.comentario ?? "").replace(/"/g, '""'),
  ]);

  const csv = [header, ...linhas]
    .map((linha) => linha.map((v) => `"${v}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportEmRiscoToCsv(rows: AtendimentoComMetricas[], filename = "em-risco.csv") {
  const header = [
    "Cliente",
    "E-mail",
    "Atendente",
    "Canal",
    "Aberto desde",
    "Tempo at\u00E9 1\u00AA resposta (s)",
    "Status",
    "Link do chamado",
  ];

  const linhas = rows.map((r) => [
    r.cliente_nome ?? "",
    r.cliente_email ?? "",
    r.operator_nome ?? "",
    r.canal ?? "",
    new Date(r.current_started_at).toLocaleString("pt-BR"),
    r.invalido_sem_resposta_humana ? "" : (r.tempo_primeira_resposta_seg ?? ""),
    r.status === "resolved" ? "Resolvido" : "Pendente",
    r.link_chamado ?? "",
  ]);

  const csv = [header, ...linhas]
    .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
