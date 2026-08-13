import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeHelpdesks() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel("helpdesks-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "helpdesks" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["helpdesks"] });
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
