import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Star, MessagesSquare, Timer, CheckCircle2, Trophy, Lock, PhoneCall,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Kpi } from "@/components/ui/Kpi";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BarChart, corPorFaixa } from "@/components/ui/BarChart";
import { SortableHeader } from "@/components/ui/SortableHeader";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRealtimeCsat } from "@/hooks/useRealtimeCsat";
import {
  fetchAnalyticsSummary,
  fetchAnalyticsEvolucao,
  fetchOperadorRanking,
  fetchDistribuicaoCanal,
  fetchDistribuicaoStatus,
  fetchDistribuicaoTopico,
  fetchDistinctCanais,
  fetchDashboardAtendimentoSummary,
  fetchTfrTtrPercentis,
  fetchBacklogPorIdade,
  fetchRelogioPosse,
  fetchRelogioEsperaCliente,
} from "@/services/api";
import { resolvePeriodo, periodoAnterior, type PeriodoPreset } from "@/lib/dateRanges";
import { formatDuration } from "@/lib/formatDuration";
import { cn } from "@/lib/utils";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

const statusLabel: Record<string, string> = { resolved: "Resolvido", unresolved: "Pendente" };

type RankingCampo = "total_chamados" | "tempo_1resposta_medio" | "tempo_encerramento_medio" | "csat_medio";

function corChamados() {
  return "bg-sky-500";
}

function corCsatNota(value: number) {
  return corPorFaixa(value, 4.5, 3.5);
}

function DistribuicaoBar({ data }: { data: { chave: string; total: number }[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="space-y-2">
      {data.map((d) => (
        <div key={d.chave} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate text-ink/60" title={d.chave}>{d.chave}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-bg">
            <div className="h-full rounded-full bg-forest-500" style={{ width: `${(d.total / max) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-ink/50">{d.total}</span>
        </div>
      ))}
    </div>
  );
}

export default function Analytics() {
  useRealtimeCsat();
  const { hasPermission } = usePermissions();
  const { isAdmin } = useAuth();
  const podeVerRanking = isAdmin || hasPermission("analytics");

  const [preset, setPreset] = useState<PeriodoPreset>("30dias");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  const [operadorEmail, setOperadorEmail] = useState("");
  const [canal, setCanal] = useState("");
  const [estado, setEstado] = useState("");
  const [granularidade, setGranularidade] = useState<"day" | "week" | "month">("day");
  const [rankingOrdenarPor, setRankingOrdenarPor] = useState<RankingCampo | undefined>(undefined);
  const [rankingDirecao, setRankingDirecao] = useState<"asc" | "desc">("desc");

  function ordenarRankingPorColuna(campo: RankingCampo) {
    if (rankingOrdenarPor === campo) {
      setRankingDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setRankingOrdenarPor(campo);
      setRankingDirecao("desc");
    }
  }

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { inicio: inicioAnterior, fim: fimAnterior } = useMemo(() => periodoAnterior(inicio, fim), [inicio, fim]);

  const { data: canaisDisponiveis } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });

  const filtrosAnalytics = { inicio, fim, canal: canal || undefined, categoriaCliente: undefined as string | undefined };
  // A função de resumo aceita equipe/categoria_cliente; aqui usamos só canal (estado é aplicado no ranking/distribuições).
  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["analytics-summary", filtrosAnalytics],
    queryFn: () => fetchAnalyticsSummary(filtrosAnalytics),
  });
  const { data: summaryAnterior } = useQuery({
    queryKey: ["analytics-summary", { ...filtrosAnalytics, inicio: inicioAnterior, fim: fimAnterior }],
    queryFn: () => fetchAnalyticsSummary({ inicio: inicioAnterior, fim: fimAnterior, canal: canal || undefined }),
  });

  // "Total de chamados" precisa vir de crisp_conversations (todas as
  // conversas, avaliadas ou não) — csat_results só tem as que receberam
  // avaliação (hoje 5 linhas vs. 167+ conversas), então usar a mesma fonte
  // para os dois KPIs fazia "Total de chamados" e "Total de avaliações"
  // sempre baterem igual, mascarando o descompasso real entre as duas
  // tabelas (ver decisão arquitetural no CLAUDE.md).
  const { data: totalChamados, isLoading: loadingTotalChamados } = useQuery({
    queryKey: ["dashboard-atendimento-summary", inicio, fim, canal],
    queryFn: () => fetchDashboardAtendimentoSummary(inicio, fim, canal || undefined),
  });

  const { data: evolucaoCsat, isLoading: loadingEvolucao } = useQuery({
    queryKey: ["analytics-evolucao", filtrosAnalytics, granularidade],
    queryFn: () => fetchAnalyticsEvolucao({ ...filtrosAnalytics, granularidade }),
  });

  const { data: percentis, isLoading: loadingPercentis } = useQuery({
    queryKey: ["tfr-ttr-percentis", inicio, fim, canal],
    queryFn: () => fetchTfrTtrPercentis(inicio, fim, canal || undefined),
  });

  const { data: backlog, isLoading: loadingBacklog } = useQuery({
    queryKey: ["backlog-por-idade", canal],
    queryFn: () => fetchBacklogPorIdade(canal || undefined),
  });

  const { data: posse, isLoading: loadingPosse } = useQuery({
    queryKey: ["relogio-posse", inicio, fim, canal],
    queryFn: () => fetchRelogioPosse(inicio, fim, canal || undefined),
  });

  const { data: esperaCliente, isLoading: loadingEspera } = useQuery({
    queryKey: ["relogio-espera-cliente", inicio, fim, canal],
    queryFn: () => fetchRelogioEsperaCliente(inicio, fim, canal || undefined),
  });

  const { data: ranking, isLoading: loadingRanking } = useQuery({
    queryKey: ["operador-ranking", inicio, fim, canal, estado],
    queryFn: () => fetchOperadorRanking({ inicio, fim, canal: canal || undefined, estado: estado || undefined }),
    enabled: podeVerRanking,
  });

  const { data: distCanal } = useQuery({
    queryKey: ["distribuicao", "canal", inicio, fim, estado],
    queryFn: () => fetchDistribuicaoCanal(inicio, fim, estado || undefined),
  });
  const { data: distStatus } = useQuery({
    queryKey: ["distribuicao", "status", inicio, fim, canal],
    queryFn: () => fetchDistribuicaoStatus(inicio, fim, canal || undefined),
  });
  const { data: distTopico } = useQuery({
    queryKey: ["distribuicao", "topico", inicio, fim, canal, estado],
    queryFn: () => fetchDistribuicaoTopico(inicio, fim, canal || undefined, estado || undefined),
  });

  const operadoresDisponiveis = useMemo(
    () => (ranking ?? []).map((r) => ({ nome: r.atendente, email: r.email_atendente })),
    [ranking]
  );
  const rankingFiltrado = operadorEmail ? (ranking ?? []).filter((r) => r.email_atendente === operadorEmail) : ranking ?? [];
  const destaque = ranking?.[0];

  const rankingOrdenado = useMemo(() => {
    if (!rankingOrdenarPor) return rankingFiltrado;
    const copia = [...rankingFiltrado];
    copia.sort((a, b) => {
      const av = a[rankingOrdenarPor] ?? -Infinity;
      const bv = b[rankingOrdenarPor] ?? -Infinity;
      return rankingDirecao === "asc" ? av - bv : bv - av;
    });
    return copia;
  }, [rankingFiltrado, rankingOrdenarPor, rankingDirecao]);

  const serieChamados = (evolucaoCsat ?? []).map((e) => ({ label: e.periodo.slice(5), value: e.total }));
  const serieCsat = (evolucaoCsat ?? []).map((e) => ({
    label: e.periodo.slice(5),
    value: e.media_csat,
    displayValue: e.media_csat.toFixed(1),
  }));

  const totalDelta = summary && summaryAnterior && summaryAnterior.total_avaliacoes
    ? ((summary.total_avaliacoes - summaryAnterior.total_avaliacoes) / summaryAnterior.total_avaliacoes) * 100
    : undefined;

  const statusOptions = Array.from(new Set((distStatus ?? []).map((d) => d.chave)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Analytics</h1>
          <p className="mt-1 text-sm text-ink/60">
            Painel estratégico do SAC — dados reais, calculados no banco.
          </p>
        </div>
        <DateRangePopover
          preset={preset}
          personalizado={personalizado}
          onChangePreset={setPreset}
          onChangePersonalizado={setPersonalizado}
        />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select value={operadorEmail} onChange={(e) => setOperadorEmail(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os operadores</option>
          {operadoresDisponiveis.map((o) => (
            <option key={o.email ?? o.nome} value={o.email ?? ""}>{o.nome}</option>
          ))}
        </select>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os canais</option>
          {(canaisDisponiveis ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os status</option>
          {statusOptions.map((s) => <option key={s} value={s}>{statusLabel[s] ?? s}</option>)}
        </select>
      </Card>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Indicadores principais</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="Total de chamados" value={loadingTotalChamados ? "..." : String(totalChamados?.total_conversas ?? 0)} icon={PhoneCall} />
          <Kpi label="Total de avaliações" value={loadingSummary ? "..." : String(summary?.total_avaliacoes ?? 0)} delta={totalDelta} icon={MessagesSquare} />
          <Kpi label="CSAT (nota média)" value={loadingSummary ? "..." : summary?.media_csat?.toFixed(1) ?? "—"} icon={Star} />
          <Kpi label="CSAT positivo" value={loadingSummary ? "..." : summary?.percentual_satisfacao !== null && summary?.percentual_satisfacao !== undefined ? `${summary.percentual_satisfacao}%` : "—"} icon={CheckCircle2} />
          <Kpi label="Tempo médio 1ª resposta" value={formatDuration(summary?.tempo_1resposta_medio ?? null)} icon={Timer} />
          <Kpi label="Tempo médio de encerramento" value={formatDuration(summary?.tempo_encerramento_medio ?? null)} icon={Timer} />
        </div>
        <p className="mt-2 text-xs text-ink/40">
          "Total de chamados" conta todas as conversas do período (avaliadas ou não); "Total de avaliações" conta
          só as que receberam uma nota de CSAT — por isso os dois números normalmente são diferentes.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Velocidade</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">TFR — tempo até 1ª resposta humana</p>
            {loadingPercentis ? (
              <p className="mt-2 text-sm text-ink/50">Carregando...</p>
            ) : !percentis || percentis.tfr_amostras === 0 ? (
              <p className="mt-2 text-sm text-ink/50">Sem amostras no período.</p>
            ) : (
              <>
                <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.tfr_media)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                  <span>P50: {formatDuration(percentis.tfr_p50)}</span>
                  <span>P90: {formatDuration(percentis.tfr_p90)}</span>
                  <span>P95: {formatDuration(percentis.tfr_p95)}</span>
                </div>
                <p className={cn("mt-2 text-sm font-medium", (percentis.tfr_sla_pct ?? 0) >= 80 ? "text-forest-600" : "text-rust-500")}>
                  SLA cumprido: {percentis.tfr_sla_pct?.toFixed(1) ?? "—"}%
                </p>
                <p className="mt-1 text-[11px] text-ink/40">{percentis.tfr_amostras} amostras</p>
              </>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">TTR — tempo até resolução</p>
            {loadingPercentis ? (
              <p className="mt-2 text-sm text-ink/50">Carregando...</p>
            ) : !percentis || percentis.ttr_amostras === 0 ? (
              <p className="mt-2 text-sm text-ink/50">Sem amostras no período.</p>
            ) : (
              <>
                <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration(percentis.ttr_media)}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink/60">
                  <span>P50: {formatDuration(percentis.ttr_p50)}</span>
                  <span>P90: {formatDuration(percentis.ttr_p90)}</span>
                  <span>P95: {formatDuration(percentis.ttr_p95)}</span>
                </div>
                <p className={cn("mt-2 text-sm font-medium", (percentis.ttr_sla_pct ?? 0) >= 80 ? "text-forest-600" : "text-rust-500")}>
                  SLA cumprido: {percentis.ttr_sla_pct?.toFixed(1) ?? "—"}%
                </p>
                <p className="mt-1 text-[11px] text-ink/40">{percentis.ttr_amostras} amostras</p>
              </>
            )}
          </Card>
        </div>
        <p className="mt-2 text-xs text-ink/40">
          SLA de 1ª resposta e de resolução são independentes (metas em minutos configuráveis em <code>sla_config</code>,
          hoje uma regra única global). Tempo já desconta fora de expediente.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Operação — Backlog</h2>
        {loadingBacklog ? (
          <p className="text-sm text-ink/50">Carregando...</p>
        ) : !backlog || backlog.length === 0 ? (
          <Card className="p-4"><p className="text-sm text-ink/50">Nenhum chamado em aberto.</p></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(["0-1 dia", "2-3 dias", "4-7 dias", "+7 dias"] as const).map((faixa) => {
              const total = backlog.find((b) => b.faixa === faixa)?.total ?? 0;
              const critico = faixa === "+7 dias";
              return (
                <Card key={faixa} className={cn("p-4", critico && total > 0 && "border-rust-400/40 bg-rust-500/5")}>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink/40">{faixa}</p>
                  <p className={cn("mt-1 font-display text-kpi-lg font-semibold", critico && total > 0 ? "text-rust-600" : "text-ink")}>{total}</p>
                </Card>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-xs text-ink/40">
          Total em aberto: {backlog?.reduce((acc, b) => acc + b.total, 0) ?? 0} chamados. Evolução histórica do
          backlog ainda não é possível — não existe um snapshot diário salvo, só o estado atual.
        </p>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Relógios do atendimento</h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio do cliente</p>
            <p className="mt-1 text-sm text-ink/60">Abertura até resolução final — é o TTR já mostrado em Velocidade, do ponto de vista de quem esperou.</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de espera do cliente</p>
            {loadingEspera ? (
              <p className="mt-2 text-sm text-ink/50">Carregando...</p>
            ) : !esperaCliente || esperaCliente.amostras === 0 ? (
              <p className="mt-2 text-sm text-ink/50">Sem amostras (só considera chamados resolvidos).</p>
            ) : (
              <>
                <p className="mt-1 font-display text-kpi-lg font-semibold text-ink">{formatDuration((esperaCliente.minutos_espera_medio ?? 0) * 60)}</p>
                <p className="mt-1 text-[11px] text-ink/40">
                  Média por espera · {esperaCliente.amostras} janelas em que o cliente falou e ficou aguardando ação da Greenn
                </p>
              </>
            )}
          </Card>
          <Card className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de trabalho ativo</p>
            <p className="mt-1 text-sm text-ink/50">
              Sem dado hoje — o Crisp não expõe estado de "ativo/ausente" do operador pela API. Não vou aproximar isso com posse (é outra coisa).
            </p>
          </Card>
        </div>

        <div className="mt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink/40">Relógio de posse — por atendente (chamados resolvidos no período)</p>
          {loadingPosse ? (
            <p className="text-sm text-ink/50">Carregando...</p>
          ) : !posse || posse.length === 0 ? (
            <Card className="p-4"><p className="text-sm text-ink/50">Sem chamados resolvidos no período pra medir posse.</p></Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">Atendente</th>
                    <th className="px-4 py-3 font-medium">Tempo de posse (total)</th>
                    <th className="px-4 py-3 font-medium">Chamados resolvidos</th>
                    <th className="px-4 py-3 font-medium">Posse média por chamado</th>
                  </tr>
                </thead>
                <tbody>
                  {posse.map((p) => (
                    <tr key={p.atendente} className="border-t border-sand-line">
                      <td className="px-4 py-3 font-medium text-ink">
                        {p.atendente}
                        {p.conversas < 5 && <span className="ml-1.5 text-[11px] font-normal text-ink/40">(amostra pequena)</span>}
                      </td>
                      <td className="px-4 py-3 text-ink/70">{formatDuration(p.minutos_posse * 60)}</td>
                      <td className="px-4 py-3 text-ink/70">{p.conversas}</td>
                      <td className="px-4 py-3 text-ink/70">{formatDuration((p.minutos_posse / p.conversas) * 60)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <p className="mt-2 text-xs text-ink/40">
            Posse = tempo entre a 1ª mensagem de um atendente num chamado e a entrada do próximo atendente (ou a
            resolução, se ninguém mais entrar) — cada trecho conta só pra quem estava "com a bola" naquele momento,
            não o TTR inteiro pra todo mundo que passou pelo chamado.
          </p>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0">
          <h2 className="font-display text-sm font-semibold text-ink">Evolução de chamados e CSAT</h2>
          <SegmentedControl
            options={[["day", "Diária"], ["week", "Semanal"], ["month", "Mensal"]] as const}
            value={granularidade}
            onChange={setGranularidade}
          />
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-ink/50">Chamados</p>
            {loadingEvolucao ? <p className="text-sm text-ink/50">Carregando...</p> : serieChamados.length === 0 ? <p className="text-sm text-ink/50">Sem dados.</p> : <BarChart data={serieChamados} getColorClass={corChamados} height={128} />}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-ink/50">CSAT médio</p>
            {loadingEvolucao ? <p className="text-sm text-ink/50">Carregando...</p> : serieCsat.length === 0 ? <p className="text-sm text-ink/50">Sem dados.</p> : <BarChart data={serieCsat} getColorClass={corCsatNota} height={128} />}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="p-5 pb-0"><h2 className="font-display text-sm font-semibold text-ink">Por canal</h2></div>
          <div className="p-5">{distCanal && distCanal.length > 0 ? <DistribuicaoBar data={distCanal} /> : <p className="text-sm text-ink/50">Sem dados.</p>}</div>
        </Card>
        <Card>
          <div className="p-5 pb-0"><h2 className="font-display text-sm font-semibold text-ink">Por status</h2></div>
          <div className="p-5">
            {distStatus && distStatus.length > 0 ? (
              <DistribuicaoBar data={distStatus.map((d) => ({ ...d, chave: statusLabel[d.chave] ?? d.chave }))} />
            ) : <p className="text-sm text-ink/50">Sem dados.</p>}
          </div>
        </Card>
        <Card>
          <div className="p-5 pb-0">
            <h2 className="font-display text-sm font-semibold text-ink">Por tópico</h2>
            <p className="text-xs text-ink/40">Top 8 (tópico é texto livre, agrupado por frequência)</p>
          </div>
          <div className="p-5">{distTopico && distTopico.length > 0 ? <DistribuicaoBar data={distTopico} /> : <p className="text-sm text-ink/50">Sem dados.</p>}</div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Ranking de operadores</h2>
        {!podeVerRanking ? (
          <Card className="flex items-center gap-3 p-5">
            <Lock size={16} className="text-ink/40" />
            <p className="text-sm text-ink/50">Você não tem a permissão "Analytics" para ver o ranking nominal do time.</p>
          </Card>
        ) : loadingRanking ? (
          <p className="text-sm text-ink/50">Carregando...</p>
        ) : rankingFiltrado.length === 0 ? (
          <p className="text-sm text-ink/50">Sem avaliações suficientes neste período/filtro.</p>
        ) : (
          <>
            {destaque && (
              <Card className="mb-4 flex items-center gap-3 border-amber-400/40 bg-amber-500/5 p-4">
                <Trophy size={20} className="text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-ink">Operador destaque: {destaque.atendente}</p>
                  <p className="text-xs text-ink/50">CSAT médio {destaque.csat_medio?.toFixed(1) ?? "—"} · {destaque.total_chamados} chamados</p>
                </div>
              </Card>
            )}
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                  <tr>
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">Operador</th>
                    <SortableHeader field="total_chamados" label="Chamados" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader field="tempo_1resposta_medio" label="1ª resposta" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader field="tempo_encerramento_medio" label="Encerramento" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                    <SortableHeader field="csat_medio" label="CSAT (0–5)" ordenarPor={rankingOrdenarPor} direcao={rankingDirecao} onSort={ordenarRankingPorColuna} />
                  </tr>
                </thead>
                <tbody>
                  {rankingOrdenado.map((r) => (
                    <tr key={r.email_atendente ?? r.atendente} className="border-t border-sand-line">
                      <td className="px-4 py-3"><Badge tone={r.posicao === 1 ? "brand" : "neutral"}>#{r.posicao}</Badge></td>
                      <td className="px-4 py-3 font-medium text-ink">{r.atendente}{!r.user_id && <span className="ml-1 text-xs text-ink/40">(sem conta no Hub)</span>}</td>
                      <td className="px-4 py-3 text-ink/70">{r.total_chamados}</td>
                      <td className="px-4 py-3 text-ink/70">{formatDuration(r.tempo_1resposta_medio)}</td>
                      <td className="px-4 py-3 text-ink/70">{formatDuration(r.tempo_encerramento_medio)}</td>
                      <td className="px-4 py-3">{r.csat_medio?.toFixed(1) ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
