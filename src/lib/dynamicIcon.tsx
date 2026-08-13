import type { LucideProps } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Link2 } from "lucide-react";

type IconName = keyof typeof LucideIcons;

/**
 * Renderiza um ícone do lucide-react a partir do nome salvo no banco
 * (coluna `icone` em public.tools). Cai para Link2 se o nome não existir —
 * evita quebrar a tela por causa de um valor digitado errado no admin.
 */
export function DynamicIcon({ name, ...props }: { name?: string | null } & LucideProps) {
  const Icon =
    (name && (LucideIcons[name as IconName] as React.ComponentType<LucideProps>)) || Link2;
  return <Icon {...props} />;
}

// Lista curta de ícones sugeridos no formulário de admin (não precisa ser exaustiva —
// qualquer nome válido do lucide-react funciona no campo de texto).
export const ICONES_SUGERIDOS = [
  "Link2",
  "PieChart",
  "Database",
  "MessageCircle",
  "HardDrive",
  "MessagesSquare",
  "NotebookText",
  "Bot",
  "FileSpreadsheet",
  "Users",
  "Calendar",
  "Rocket",
] as const;
