import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeHelpdesks() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
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
      sb.removeChannel(channel);
    };
  }, [queryClient]);
}
