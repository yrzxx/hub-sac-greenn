import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em public.crisp_conversations via Supabase Realtime.
 * O Dashboard, Atendimentos e Performance atualizam sozinhos assim que o
 * n8n grava uma nova conversa, sem precisar recarregar a página.
 */
export function useRealtimeConversas() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel("crisp-conversations-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crisp_conversations" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-atendimento"] });
          queryClient.invalidateQueries({ queryKey: ["conversas-evolucao"] });
          queryClient.invalidateQueries({ queryKey: ["atendente-performance"] });
          queryClient.invalidateQueries({ queryKey: ["distribuicao-conversas"] });
          queryClient.invalidateQueries({ queryKey: ["conversas-filtradas"] });
          queryClient.invalidateQueries({ queryKey: ["conversas-nota-baixa"] });
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient]);
}
