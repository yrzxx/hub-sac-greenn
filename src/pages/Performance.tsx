import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Lock, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeConversas } from "@/hooks/useRealtimeConversas";
import {
  fetchAtendentePerformance,
  fetchDistinctCanais,
  fetchConversasNotaBaixa,
} from "@/services/api";
import { resolvePeriodo, type PeriodoPreset } from "@/lib/dateRanges";

import { formatDurationFromMinutes as formatMin } from "@/lib/formatDuration";
import { DateRangePopover } from "@/components/ui/DateRangePopover";

export default function Performance() {
  useRealtimeConversas();
  const { isAdmin } = useAuth();
  const podeVer = isAdmin;

  const [preset, setPreset] = useState<PeriodoPreset>("30dias");
  const [personalizado, setPersonalizado] = useState({ inicio: "", fim: "" });
  const [canal, setCanal] = useState("");
  const [status, setStatus] = useState("");

  const { inicio, fim } = useMemo(() => resolvePeriodo(preset, personalizado), [preset, personalizado]);
  const { data: canais } = useQuery({ queryKey: ["canais"], queryFn: fetchDistinctCanais });

  const { data: ranking, isLoading } = useQuery({
    queryKey: ["atendente-performance", inicio, fim, canal, status],
    queryFn: () => fetchAtendentePerformance(inicio, fim, canal || undefined, status || undefined),
    enabled: podeVer,
  });

  const { data: notasBaixas } = useQuery({
    queryKey: ["conversas-nota-baixa", inicio, fim],
    queryFn: () => fetchConversasNotaBaixa(inicio, fim, 2),
    enabled: podeVer,
  });

  if (!podeVer) {
    return (
      <Card className="flex items-center gap-3 p-5">
        <Lock size={16} className="text-ink/40" />
        <p className="text-sm text-ink/50">Você não tem a permissão "Analytics" para ver a Performance do time.</p>
      </Card>
    );
  }

  const destaque = ranking?.[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display text-ink">Performance</h1>
          <p className="mt-1 text-sm text-ink/60">Ranking de atendentes com base nas conversas do Crisp.</p>
        </div>
        <DateRangePopover
          preset={preset}
          personalizado={personalizado}
          onChangePreset={setPreset}
          onChangePersonalizado={setPersonalizado}
        />
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os canais</option>
          {(canais ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-lg border border-sand-line bg-white px-2 text-sm">
          <option value="">Todos os status</option>
          <option value="resolved">Resolvido</option>
          <option value="unresolved">Pendente</option>
        </select>
      </Card>

      {isLoading ? (
        <p className="text-sm text-ink/50">Carregando...</p>
      ) : !ranking || ranking.length === 0 ? (
        <p className="text-sm text-ink/50">Sem atendimentos neste período/filtro.</p>
      ) : (
        <>
          {destaque && (
            <Card className="flex items-center gap-3 border-amber-400/40 bg-amber-500/5 p-4">
              <Trophy size={20} className="text-amber-500" />
              <div>
                <p className="text-sm font-medium text-ink">Destaque em volume: {destaque.operator_nome}</p>
                <p className="text-xs text-ink/50">{destaque.total_atendimentos} atendimentos · CSAT {destaque.csat_medio?.toFixed(1) ?? "—"}</p>
              </div>
            </Card>
          )}
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sand-bg text-left text-xs uppercase tracking-wide text-ink/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Atendente</th>
                  <th className="px-4 py-3 font-medium">Total de atendimentos</th>
                  <th className="px-4 py-3 font-medium">TFR médio</th>
                  <th className="px-4 py-3 font-medium">Tempo médio de resolução</th>
                  <th className="px-4 py-3 font-medium">CSAT médio</th>
                  <th className="px-4 py-3 font-medium">Avaliações</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.operator_email ?? r.operator_nome} className="border-t border-sand-line">
                    <td className="px-4 py-3 font-medium text-ink">{r.operator_nome}</td>
                    <td className="px-4 py-3 text-ink/70">{r.total_atendimentos}</td>
                    <td className="px-4 py-3 text-ink/70">{formatMin(r.tfr_medio)}</td>
                    <td className="px-4 py-3 text-ink/70">{formatMin(r.tempo_resolucao_medio)}</td>
                    <td className="px-4 py-3">{r.csat_medio?.toFixed(1) ?? "—"}</td>
                    <td className="px-4 py-3 text-ink/70">{r.total_avaliacoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      <div>
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Conversas com nota baixa (CSAT ≤ 2)</h2>
        {!notasBaixas || notasBaixas.length === 0 ? (
          <Card className="flex items-start gap-3 p-4">
            <AlertTriangle size={16} className="mt-0.5 text-ink/40" />
            <p className="text-sm text-ink/50">
              Nenhum registro ainda — esta análise depende do vínculo <code>csat_results.crisp_id</code> com{" "}
              <code>crisp_conversations.crisp_id</code>, que hoje está sem preenchimento no pipeline do n8n.
              Assim que isso for populado, os casos aparecerão aqui automaticamente.
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {notasBaixas.map((n) => (
              <Card key={n.crisp_id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{n.cliente_nome} · {n.operator_nome}</span>
                  <Badge tone="danger">Nota {n.nota}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">{n.canal} · {n.topico}</p>
                {n.comentario && <p className="mt-1 text-sm text-ink/70">{n.comentario}</p>}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
