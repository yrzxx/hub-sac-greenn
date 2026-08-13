import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Assina mudanças em public.user_status via Supabase Realtime e invalida o
 * cache do TanStack Query sempre que algo mudar — assim a lista de
 * "Colaboradores Online" atualiza sozinha, sem polling.
 */
export function useRealtimeUserStatus() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel("user-status-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_status" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["user-statuses"] });
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient]);
}
