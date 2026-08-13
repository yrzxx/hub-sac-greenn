import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em public.csat_results via Supabase Realtime e invalida
 * as queries do Analytics/CSAT — os cards e gráficos atualizam sozinhos
 * assim que uma nova avaliação chega, sem precisar dar F5.
 */
export function useRealtimeCsat() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("csat-results-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "csat_results" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["analytics-summary"] });
          queryClient.invalidateQueries({ queryKey: ["analytics-evolucao"] });
          queryClient.invalidateQueries({ queryKey: ["operador-ranking"] });
          queryClient.invalidateQueries({ queryKey: ["distribuicao"] });
          queryClient.invalidateQueries({ queryKey: ["csat"] });
          queryClient.invalidateQueries({ queryKey: ["csat-planilha"] });
          queryClient.invalidateQueries({ queryKey: ["csat-dashboard"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
