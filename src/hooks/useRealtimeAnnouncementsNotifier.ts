import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { playNotificationSound } from "@/lib/notificationSound";
import { useNotifications } from "@/contexts/NotificationsContext";

/**
 * Monta uma única vez (no AppLayout). Toda vez que uma nova Atualização é
 * publicada, toca o som de notificação, atualiza o badge do sino e invalida
 * o cache — em tempo real, sem precisar recarregar a página.
 */
export function useRealtimeAnnouncementsNotifier() {
  const queryClient = useQueryClient();
  const { registrarNovaAtualizacao } = useNotifications();

  useEffect(() => {
    if (!supabase) return;
    const sb = supabase;

    const channel = sb
      .channel("announcements-notifier")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "announcements" },
        (payload) => {
          playNotificationSound();
          registrarNovaAtualizacao((payload.new as { categoria: string | null }).categoria);
          queryClient.invalidateQueries({ queryKey: ["announcements"] });
        }
      )
      .subscribe();

    return () => {
      sb.removeChannel(channel);
    };
  }, [queryClient, registrarNovaAtualizacao]);
}
