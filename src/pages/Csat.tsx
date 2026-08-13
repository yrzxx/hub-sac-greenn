import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download, ArrowUpDown, Star, FileDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Kpi } from "@/components/ui/Kpi";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { fetchDistinctOperadores, fetchCsatFiltered, fetchCsatForDashboard, fetchAtendenteAliases } from "@/services/api";
import type { CsatFilters } from "@/services/api";
import { exportCsatToCsv } from "@/lib/exportCsv";
import { exportCsatDashboardToPdf } from "@/lib/exportPdf";
import {
  PERIODO_LABELS,
  resolvePeriodo,
  periodoAnterior,
  type PeriodoPreset,
} from "@/lib/dateRanges";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

const PAGE_SIZE = 10;

export default function Csat() {
  const [aba, setAba] = useState<"planilha" | "dashboard">("planilha");
  const [preset, setPreset] = useState<PeriodoPreset>("30dias");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  const [busca, setBusca] = useState("");
  const [emailAtendente, setEmailAtendente] = useState("");
  const [topico, setTopico] = useState("");
  const [categoriaCliente, setCategoriaCliente] = useState("");
  const [nota, setNota] = useState("");
  const [classificacaoCsat, setClassificacaoCsat] = useState<"" | "Promotor" | "Neutro" | "Detrator">("");
  const [sortBy, setSortBy] = useState("data_hora");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(
    () => periodoAnterior(inicio, fim),
    [inicio, fim]
  );

  const { data: operadores } = useQuery({ queryKey: ["operadores"], queryFn: fetchDistinctOperadores });

  const filtrosBase: Omit<CsatFilters, "page" | "pageSize" | "sortBy" | "sortAsc"> = {
    busca: busca || undefined,
    emailAtendente: emailAtendente || undefined,
    topico: topico || undefined,
    categoriaCliente: categoriaCliente || undefined,
    nota: nota ? Number(nota) : undefined,
    classificacaoCsat: classificacaoCsat || undefined,
    inicio,
    fim,
  };

  const { data: planilha, isLoading: loadingPlanilha } = useQuery({
    queryKey: ["csat-planilha", filtrosBase, sortBy, sortAsc, page],
    queryFn: () =>
      fetchCsatFiltered({ ...filtrosBase, sortBy, sortAsc, page, pageSize: PAGE_SIZE }),
    enabled: aba === "planilha",
  });

  const { data: dashboardRows, isLoading: loadingDashboard } = useQuery({
    queryKey: ["csat-dashboard", filtrosBase],
    queryFn: () => fetchCsatForDashboard(filtrosBase),
    enabled: aba === "dashboard",
  });

  const { data: dashboardAnterior } = useQuery({
    queryKey: ["csat-dashboard-anterior", inicioAnterior, fimAnterior],
    queryFn: () =>
      fetchCsatForDashboard({ inicio: inicioAnterior, fim: fimAnterior }),
    enabled: aba === "dashboard",
  });

  function alternarOrdenacao(campo: string) {
    if (sortBy === campo) setSortAsc(!sortAsc);
    else {
      setSortBy(campo);
      setSortAsc(false);
    }
  }

  async function exportar() {
    const todos = await fetchCsatForDashboard(filtrosBase);
    exportCsatToCsv(todos, `csat-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const topicos = Array.from(new Set((planilha?.rows ?? []).map((r) => r.topico).filter(Boolean)));

  const { data: aliases } = useQuery({ queryKey: ["atendente-aliases"], queryFn: fetchAtendenteAliases });
  const aliasMap = useMemo(() => {
    const m = new Map<string, { email: string; nome: string }>();
    (aliases ?? []).forEach((a) => m.set(a.email_variante, { email: a.email_canonico, nome: a.nome_canonico }));
    return m;
  }, [aliases]);

  function normalizarChave(emailAtendente: string | null, atendente: string) {
    const alias = emailAtendente ? aliasMap.get(emailAtendente) : undefined;
    return {
      chave: alias?.email ?? emailAtendente ?? atendente,
      atendente: alias?.nome ?? atendente,
    };
  }

  const porColaborador = useMemo(() => {
    const map = new Map<string, { atendente: string; notas: number[]; ultima: string }>();
    (dashboardRows ?? []).forEach((r) => {
      const { chave, atendente } = normalizarChave(r.email_atendente, r.atendente);
      if (!chave) return;
      const entry = map.get(chave) ?? { atendente, notas: [], ultima: r.data_hora };
      if (r.nota !== null) entry.notas.push(r.nota);
      if (new Date(r.data_hora) > new Date(entry.ultima)) entry.ultima = r.data_hora;
      map.set(chave, entry);
    });
    return Array.from(map.entries()).map(([chave, v]) => {
      const media = v.notas.length ? v.notas.reduce((a, b) => a + b, 0) / v.notas.length : null;
      const satisfeitos = v.notas.filter((n) => n >= 4).length;
      const percentual = v.notas.length ? (satisfeitos / v.notas.length) * 100 : null;

      const notasAnteriores = (dashboardAnterior ?? [])
        .filter((r) => normalizarChave(r.email_atendente, r.atendente).chave === chave && r.nota !== null)
        .map((r) => r.nota as number);
      const mediaAnterior = notasAnteriores.length
        ? notasAnteriores.reduce((a, b) => a + b, 0) / notasAnteriores.length
        : null;
      const evolucao =
        media !== null && mediaAnterior ? ((media - mediaAnterior) / mediaAnterior) * 100 : undefined;

      return { uid: chave, atendente: v.atendente, media, total: v.notas.length, percentual, ultima: v.ultima, evolucao };
    });
  }, [dashboardRows, dashboardAnterior, aliasMap]);

  const totalPages = planilha ? Math.ceil(planilha.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-display text-ink">CSAT</h1>
          <p className="mt-1 text-sm text-ink/60">
            Planilha completa e dashboard por colaborador, com filtros e exportação.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-sand-bg p-1">
          {(["planilha", "dashboard"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={
                "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors " +
                (aba === a ? "bg-white shadow-sm text-ink" : "text-ink/50")
              }
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <DateRangePopover
        preset={preset}
        personalizado={personalizado}
        onChangePreset={setPreset}
        onChangePersonalizado={setPersonalizado}
      />

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar comentário/atendente..."
            className="h-9 rounded-lg border border-sand-line bg-white pl-8 pr-2 text-sm outline-none focus:border-forest-500"
          />
        </div>
        <select value={emailAtendente} onChange={(e) => setEmailAtendente(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os colaboradores</option>
          {(operadores ?? []).map((o) => (
            <option key={o.email_atendente ?? o.atendente} value={o.email_atendente ?? ""}>{o.atendente}</option>
          ))}
        </select>
        <select value={topico} onChange={(e) => setTopico(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todas as categorias</option>
          {topicos.map((t) => <option key={t} value={t!}>{t}</option>)}
        </select>
        <select value={categoriaCliente} onChange={(e) => setCategoriaCliente(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os tipos de cliente</option>
          <option value="Consumidor">Consumidor</option>
          <option value="Produtor">Produtor</option>
          <option value="Não identificado">Não identificado</option>
        </select>
        <select value={nota} onChange={(e) => setNota(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todas as notas</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={classificacaoCsat} onChange={(e) => setClassificacaoCsat(e.target.value as "" | "Promotor" | "Neutro" | "Detrator")} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todas as classificações</option>
          <option value="Promotor">Promotor</option>
          <option value="Neutro">Neutro</option>
          <option value="Detrator">Detrator</option>
        </select>
        <Button variant="secondary" size="sm" onClick={exportar} className="ml-auto">
          <Download size={14} /> Exportar CSV
        </Button>
      </Card>

      {aba === "planilha" ? (
        <>
          {loadingPlanilha ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
            </div>
          ) : !planilha || planilha.rows.length === 0 ? (
            <EmptyState icon={Star} title="Nenhum registro encontrado" description="Ajuste os filtros ou o período selecionado." />
          ) : (
            <>
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                    <tr>
                      {[
                        ["data_hora", "Data"],
                        ["", "Colaborador"],
                        ["", "Cliente"],
                        ["topico", "Categoria"],
                        ["nota", "Nota"],
                        ["classificacao_csat", "Classificação"],
                        ["", "Comentário"],
                      ].map(([field, label]) => (
                        <th
                          key={label}
                          className={"px-4 py-3 font-medium" + (field ? " cursor-pointer select-none" : "")}
                          onClick={() => field && alternarOrdenacao(field)}
                        >
                          <span className="flex items-center gap-1">
                            {label}
                            {field && <ArrowUpDown size={11} />}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {planilha.rows.map((r) => (
                      <tr key={r.id} className="border-t border-sand-line">
                        <td className="px-4 py-3 text-ink/70">{new Date(r.data_hora).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-ink">{r.atendente}</td>
                        <td className="px-4 py-3 text-ink/70">
                          <p className="text-ink">{r.cliente ?? "—"}</p>
                          <p className="text-xs text-ink/50">{r.email ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 text-ink/70">{r.topico ?? "—"}</td>
                        <td className="px-4 py-3">{r.nota ?? "—"}</td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              r.classificacao_csat === "Promotor"
                                ? "success"
                                : r.classificacao_csat === "Detrator"
                                  ? "danger"
                                  : "warning"
                            }
                          >
                            {r.classificacao_csat ?? "—"}
                          </Badge>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-ink/70" title={r.comentario ?? undefined}>
                          {r.comentario ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <div className="flex items-center justify-between text-sm text-ink/60">
                <span>{planilha.count} registros</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </Button>
                  <span className="flex items-center px-2 text-xs">Página {page + 1} de {Math.max(totalPages, 1)}</span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      ) : loadingDashboard ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : porColaborador.length === 0 ? (
        <EmptyState icon={Star} title="Sem dados no período" description="Ajuste os filtros ou o período selecionado." />
      ) : (
        <>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                exportCsatDashboardToPdf({
                  periodoLabel: PERIODO_LABELS[preset],
                  totalAvaliacoes: porColaborador.reduce((acc, c) => acc + c.total, 0),
                  porColaborador,
                })
              }
            >
              <FileDown size={14} /> Exportar dashboard em PDF
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {porColaborador.map((c) => (
            <Card key={c.uid} className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-forest-50 text-sm font-display font-semibold text-forest-700">
                  {c.atendente?.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{c.atendente}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Kpi label="Nota média" value={c.media?.toFixed(1) ?? "—"} delta={c.evolucao} />
                <Kpi label="Satisfação" value={c.percentual !== null ? `${c.percentual.toFixed(0)}%` : "—"} />
              </div>
              <CardContent className="mt-2 px-0 pb-0 text-xs text-ink/50">
                <strong className="text-ink">{c.total}</strong> avaliações · Última em {new Date(c.ultima).toLocaleDateString("pt-BR")}
              </CardContent>
            </Card>
          ))}
          </div>
        </>
      )}
    </div>
  );
}
