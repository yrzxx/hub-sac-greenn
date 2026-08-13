import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PhoneCall, Search, ExternalLink, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import {
  fetchAtendimentosComMetricas,
  fetchDistinctTiposCliente,
  fetchDistinctCanais,
  fetchDistinctAtendentesConversas,
} from "@/services/api";
import { formatDuration } from "@/lib/formatDuration";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

const statusTone: Record<string, "success" | "warning" | "neutral"> = {
  resolved: "success",
  unresolved: "warning",
};
const statusLabel: Record<string, string> = { resolved: "Resolvido", unresolved: "Pendente" };

const PAGE_SIZE = 15;

export default function Atendimentos() {
  useRealtimeConversas();
  const [preset, setPreset] = useState<PeriodoPreset>("30dias");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  const [busca, setBusca] = useState("");
  const [tipoCliente, setTipoCliente] = useState("");
  const [canal, setCanal] = useState("");
  const [atendenteEmail, setAtendenteEmail] = useState("");
  const [page, setPage] = useState(0);

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { data: tiposCliente } = useQuery({ queryKey: ["tipos-cliente"], queryFn: fetchDistinctTiposCliente });
  const { data: canais } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });
  const { data: atendentes } = useQuery({ queryKey: ["atendentes-conversas"], queryFn: fetchDistinctAtendentesConversas });

  const filtros = useMemo(
    () => ({
      inicio, fim,
      busca: busca || undefined,
      tipoCliente: tipoCliente || undefined,
      canal: canal || undefined,
      atendenteEmail: atendenteEmail || undefined,
    }),
    [inicio, fim, busca, tipoCliente, canal, atendenteEmail]
  );

  const { data, isLoading } = useQuery({
    queryKey: ["atendimentos-metricas", filtros, page],
    queryFn: () => fetchAtendimentosComMetricas({ ...filtros, page, pageSize: PAGE_SIZE }),
  });

  const totalPages = data ? Math.ceil(data.count / PAGE_SIZE) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Atendimentos</h1>
          <p className="mt-1 text-sm text-ink/60">
            Lista completa de conversas vindas do Crisp — 1ª resposta considera apenas atendente humano (bot da Crisp é ignorado).
          </p>
        </div>
        <DateRangePopover
          preset={preset}
          personalizado={personalizado}
          onChangePreset={(v) => { setPreset(v); setPage(0); }}
          onChangePersonalizado={setPersonalizado}
        />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setPage(0); }}
            placeholder="Buscar por nome ou email do cliente..."
            className="h-9 w-full rounded-lg border border-sand-line bg-white pl-8 pr-2 text-sm outline-none focus:border-forest-500"
          />
        </div>
        <select value={atendenteEmail} onChange={(e) => { setAtendenteEmail(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os atendentes</option>
          {(atendentes ?? []).map((a) => <option key={a.email} value={a.email}>{a.nome}</option>)}
        </select>
        <select value={canal} onChange={(e) => { setCanal(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os canais</option>
          {(canais ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={tipoCliente} onChange={(e) => { setTipoCliente(e.target.value); setPage(0); }} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os tipos de cliente</option>
          {(tiposCliente ?? []).map((t) => <option key={t.tag} value={t.tag}>{t.label}</option>)}
        </select>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={PhoneCall} title="Nenhum atendimento encontrado" description="Ajuste os filtros ou o período selecionado." />
      ) : (
        <>
          <Card>
            <table className="w-full table-fixed text-sm">
              <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Atendente</th>
                  <th className="px-4 py-3 font-medium">Início</th>
                  <th className="px-4 py-3 font-medium">1ª resposta humana</th>
                  <th className="px-4 py-3 font-medium">Tempo até 1ª resposta</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Resolução</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((c) => {
                  const invalido = c.invalido_resposta_antes_inicio || c.invalido_tempo_negativo;
                  return (
                    <tr key={c.id} className={"border-t border-sand-line align-top " + (invalido ? "bg-rust-500/5" : "")}>
                      <td className="truncate px-4 py-3">
                        <p className="truncate font-medium text-ink">{c.cliente_nome ?? "—"}</p>
                        <p className="truncate text-xs text-ink/50">{c.cliente_email}</p>
                      </td>
                      <td className="truncate px-4 py-3 text-ink/70">{c.operator_nome ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-ink/60">{new Date(c.current_started_at).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3 text-xs text-ink/60">
                        {c.primeira_resposta_humana_at ? new Date(c.primeira_resposta_humana_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {c.invalido_sem_resposta_humana ? (
                          <span className="text-xs text-ink/40">sem resposta humana</span>
                        ) : invalido ? (
                          <span title="Dado inconsistente: resposta antes do início ou tempo negativo" className="flex items-center gap-1 text-xs text-rust-500">
                            <AlertTriangle size={12} /> inválido
                          </span>
                        ) : (
                          formatDuration(c.tempo_primeira_resposta_seg)
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-ink/70 lg:table-cell">{formatDuration(c.tempo_resolucao_seg)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={c.status ? statusTone[c.status] ?? "neutral" : "neutral"}>
                          {c.status ? statusLabel[c.status] ?? c.status : "—"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.link_chamado ? (
                          <a href={c.link_chamado} target="_blank" rel="noreferrer">
                            <Button variant="secondary" size="sm">
                              <ExternalLink size={13} /> Ver chamado
                            </Button>
                          </a>
                        ) : (
                          <span className="text-xs text-ink/30">sem link</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="flex items-center justify-between text-sm text-ink/60">
            <span>{data.count} atendimentos</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="flex items-center px-2 text-xs">Página {page + 1} de {Math.max(totalPages, 1)}</span>
              <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
