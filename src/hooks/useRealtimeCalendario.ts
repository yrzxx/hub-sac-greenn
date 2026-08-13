import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const TABELAS = [
  "calendar_leave_requests",
  "calendar_week_responsibles",
  "calendar_saturday_oncall",
  "calendar_oncall",
  "calendar_vacations",
  "calendar_day_entries",
];

export function useRealtimeCalendario() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel("calendario-changes");
    TABELAS.forEach((tabela) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table: tabela }, () => {
        queryClient.invalidateQueries({ queryKey: ["calendario"] });
      });
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
