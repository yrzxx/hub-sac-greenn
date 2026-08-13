import { createClient } from "@supabase/supabase-js";

// As credenciais devem vir de variáveis de ambiente (.env), nunca hardcoded.
// Ver .env.example na raiz do projeto.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

// Enquanto as credenciais reais não são configuradas, o Hub roda inteiramente
// sobre dados mockados (src/lib/mockData.ts). Isso permite validar UX e fluxo
// de produto antes de existir schema de banco definitivo.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const isSupabaseConfigured = Boolean(supabase);
