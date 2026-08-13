# CLAUDE.md — Hub SAC Greenn

> Documento de contexto para continuar o desenvolvimento deste projeto em
> qualquer conversa nova com o Claude. Mantenha-o atualizado sempre que uma
> funcionalidade importante for implementada ou alterada — veja a seção
> "Como manter este arquivo atualizado" no final.

## 1. Objetivo do sistema

O Hub SAC Greenn é a plataforma única do time de Suporte (SAC) da Greenn.
Centraliza em um só lugar: indicadores de desempenho individuais e do time
(CSAT, NPS, Reclame Aqui, Analytics de atendimento), gamificação (Missões),
comunicação interna (Atualizações/comunicados), gestão de escala e
calendário (plantões, folgas, férias, sobreaviso), solicitação de
ferramentas (Helpdesks), conteúdo (Cursos, Documentação, Outros Links) e
administração completa (usuários, perfis, permissões, módulos).

Público: colaboradores do time de SAC (perfil "Colaborador") e gestores
(perfil "Administrador"). Não é multi-tenant — é uma aplicação interna de
uso exclusivo da Greenn.

## 2. Arquitetura geral

- **SPA React** servida pelo Vite, sem SSR.
- **Backend as a Service**: todo o backend é Supabase (Postgres + Auth +
  Realtime + Storage). Não existe servidor Node/API própria — o frontend
  fala diretamente com o Supabase via `@supabase/supabase-js`, e toda a
  regra de negócio pesada (agregações, rankings, cálculos de tempo) vive em
  **funções SQL no Postgres** (`security definer`), não no frontend.
- **Segurança por RLS**: toda tabela tem Row Level Security. O frontend
  nunca é a única barreira — permissões granulares e regras de visibilidade
  são reforçadas no banco (`is_admin()`, `has_permission(slug)`,
  `current_app_user_id()`), então mesmo chamando a API do Supabase
  diretamente (bypassando a UI) as mesmas regras valem.
- **Camada única de acesso a dados**: `src/services/api.ts` (~1350 linhas,
  ~100 funções) é o único lugar que fala com `supabase.from(...)` ou
  `supabase.rpc(...)`. Páginas e hooks nunca chamam o client Supabase
  diretamente para dados de negócio (só os hooks `useRealtime*` acessam
  `supabase.channel(...)` para assinar mudanças).
- **Cache/estado assíncrono**: TanStack Query (`@tanstack/react-query`) para
  toda leitura; sem Redux/Zustand — estado de UI local fica em `useState`
  dentro do próprio componente/página.
- **Tempo real**: Supabase Realtime (`postgres_changes`) em vez de polling,
  via hooks dedicados que invalidam queries do TanStack Query quando uma
  tabela muda (ver seção 9).
- **Sem servidor de integração próprio**: dados de atendimento (Crisp) e
  qualquer integração externa chegam ao Postgres via **pipeline n8n
  externo**, que não faz parte deste repositório (ver seção 8).

Não há testes automatizados configurados no projeto até o momento.

## 3. Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| Build/dev server | Vite 5 |
| Linguagem | TypeScript 5 (strict mode) |
| UI | React 18 |
| Roteamento | React Router DOM v6 |
| Estilo | Tailwind CSS 3 (tema customizado, sem componentização externa tipo shadcn) |
| Ícones | lucide-react |
| Estado assíncrono/cache | TanStack Query v5 |
| Formulários | React Hook Form + `@hookform/resolvers` |
| Validação | Zod |
| Backend | Supabase (Postgres, Auth, Realtime, Storage) |
| Utilitários de classe CSS | `clsx` + `tailwind-merge` (helper `cn`) |
| Exportação | `jspdf` (PDF), CSV nativo (`exportCsv.ts`) |
| Animação | `framer-motion` (disponível; uso pontual) |

Scripts (`package.json`): `npm run dev`, `npm run build` (`tsc -b && vite
build`), `npm run preview`, `npm run lint` (ESLint — mas não há arquivo de
config `.eslintrc` visível no repo raiz; conferir antes de assumir que
`lint` funciona sem setup adicional).

## 4. Estrutura das pastas

```
src/
  components/
    ui/                 → componentes de design system reutilizáveis
    layout/              → Sidebar, Header (chrome fixo do app)
    GlobalSearch.tsx      → busca global no Header
    CollaboratorsOnline.tsx → seção "Colaboradores Online" da Home
  contexts/               → AuthContext, NotificationsContext, ToastContext
  hooks/
    usePermissions.ts      → RBAC granular no front
    useRealtime*.ts        → assinaturas Supabase Realtime por domínio
  integrations/
    supabase/client.ts     → client Supabase + flag isSupabaseConfigured
  layouts/
    AppLayout.tsx           → sidebar + header + <Outlet /> + providers de layout
  lib/                      → utilitários puros (ver seção 12)
  pages/                    → uma página por rota/módulo da sidebar
  pages/admin/               → páginas do painel /admin (CRUD administrativo)
  routes/                    → guards de rota (RequireAuth, AdminOnlyRoute, RequirePermission)
  services/api.ts             → ÚNICA camada de acesso a dados (Supabase)
  types/
    index.ts                  → tipos de UI (parcialmente obsoletos — ver ROADMAP.md)
    database.ts                → tipos que espelham as tabelas reais do Postgres
  App.tsx                      → definição de rotas
  main.tsx                      → bootstrap React
  index.css                     → Tailwind + poucos overrides globais
```

Não existe pasta `supabase/` com migrations neste repositório — o schema é
gerenciado diretamente no projeto Supabase ("Centralização - SAC"), fora do
controle de versão do frontend. Isso é um risco documentado (seção 20).

## 5. Fluxo de autenticação

1. `src/integrations/supabase/client.ts` cria o client Supabase a partir de
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`.env`). Se as duas
   variáveis não estiverem definidas, `supabase` é `null` e
   `isSupabaseConfigured` é `false` — o app foi desenhado para também rodar
   sem Supabase configurado (fase mockData, hoje já não usada de fato).
2. `AuthProvider` (`src/contexts/AuthContext.tsx`) escuta
   `supabase.auth.onAuthStateChange` e, a cada sessão, busca o perfil
   correspondente em `public.users` via `fetchCurrentProfile(authId)`
   (join com `roles`).
3. **Vínculo crítico**: um usuário só "existe" no Hub se `public.users.auth_id`
   apontar para o `id` do Supabase Auth. Login autenticado sem esse vínculo
   resulta em erro explícito ("nenhum registro em public.users está
   vinculado a este auth_id") — isso já derrubou o app duas vezes em
   produção (Mateus na Fase 0, Eduardo Nicolau depois) e é o primeiro lugar
   a checar se um usuário novo "não consegue entrar".
4. `mapDbUserToAppUser` converte `DbUser` (schema do banco) em `AppUser`
   (tipo de UI) e decide `perfil` (`administrador`/`colaborador`) a partir
   de `roles.nome` (case-insensitive, só reconhece exatamente
   `"Administrador"`; qualquer outro valor vira `"colaborador"`).
5. `RequireAuth` (`src/routes/RequireAuth.tsx`) é o guard de topo: sem
   `user`, redireciona para `/login`.
6. `Login.tsx` chama `auth.login(email, senha)` →
   `supabase.auth.signInWithPassword`. Não há cadastro público nem "esqueci
   minha senha" implementados na UI — contas são criadas manualmente
   (Supabase Auth + registro em `public.users` via Admin → Usuários).
7. Logout: `auth.logout()` → `supabase.auth.signOut()`.

## 6. Sistema de permissões (RBAC)

Dois níveis, compostos:

**Nível 1 — Perfil (role)**: `Administrador` tem acesso irrestrito a tudo
(front e banco, via `is_admin()` no Postgres). `Colaborador` é o padrão.
Perfis são administráveis em **Administração → Perfis**
(`AdminPerfis.tsx` + `upsertRole`/`fetchRoles`), mas o front só trata dois
valores especiais: qualquer `roles.nome !== "Administrador"` cai em
`"colaborador"` — criar um terceiro perfil hoje não muda comportamento a
menos que o código de `mapDbUserToAppUser` seja estendido.

**Nível 2 — Permissão granular por módulo**: tabela
`public.user_permissions` (`user_id` + `module_id` + `pode_gerenciar`),
decidida no banco por `has_permission(slug)` dentro do próprio RLS. Um
colaborador sem a permissão de um módulo não consegue escrever nessa
tabela mesmo manipulando a API do Supabase diretamente — a UI é só
conveniência, não a barreira real.

- `src/hooks/usePermissions.ts` expõe `hasPermission(slug)`: sempre `true`
  para admin; para os demais, busca `fetchMyPermissions(userId)` (lista de
  slugs) via TanStack Query.
- `src/routes/RequirePermission.tsx` é o guard de rota
  (`<Route element={<RequirePermission slug="csat" />}>`), usado hoje em
  `/csat`, `/reclame-aqui`, `/nps`.
- `src/routes/ProtectedRoute.tsx` exporta `AdminOnlyRoute`, usado em
  `/atendimentos`, `/performance` e todo `/admin/*` — **estrito**, sem
  bypass por permissão granular (decisão explícita registrada no README).
- **Administração → Permissões** (`AdminPermissoes.tsx`) é a matriz
  colaborador × módulo para conceder/revogar com um clique
  (`grantPermission`/`revokePermission`).
- Slugs de módulo conhecidos hoje: `missoes`, `csat`, `reclame_aqui`, `nps`,
  `cursos`, `documentacao`, `atualizacoes`, `links`, `helpdesks` (slugs
  reservados desde a Fase 1 mesmo antes do módulo existir — ver
  `public.modules`).

**Padrão para adicionar uma nova permissão**: ver seção 15.

## 7. Estrutura do banco de dados e principais tabelas

Os tipos em `src/types/database.ts` são a referência mais confiável do
schema real (mantidos manualmente em sincronia com o Postgres — não há
geração automática de tipos configurada). Tabelas principais, por domínio:

**Identidade e RBAC**
- `roles` (`DbRole`) — perfis (Administrador, Colaborador, ...).
- `users` (`DbUser`) — perfil de cada colaborador; `auth_id` vincula ao
  Supabase Auth; carrega jornada de trabalho (`horario_entrada`,
  `horario_saida_almoco`, `horario_retorno_almoco`, `horario_saida`).
- `user_permissions` (`DbUserPermission`) — permissão granular por módulo.
- `modules` (`DbModule`) — catálogo de módulos (nome, rota, slug,
  categoria, se aparece na sidebar/Home).

**Atendimento / dados do Crisp (via n8n)**
- `csat_results` (`DbCsatResult`) — **fonte de verdade de satisfação**.
  Vínculo confiável com o colaborador é `email_atendente`, **nunca**
  `user_id` (está sempre `NULL` nos dados reais — ver seção 20). Contém
  `cliente`, `telefone`, `email`, `numero_whatsapp`, `categoria_cliente`
  (`Consumidor`/`Produtor`/`Não identificado`), `classificacao_csat`
  (coluna gerada pelo Postgres a partir da nota), `link_chamado`,
  `tags_cliente`, `estado`. Campos `tempo_primeira_resposta_seg` /
  `tempo_encerramento_seg` existem mas **nunca são preenchidos pelo n8n**
  — não usar como fonte de tempo (usar `crisp_conversations`).
- `crisp_conversations` (`DbCrispConversation`) — **fonte de verdade de
  tempo/atendimento**. Vínculo confiável é `operator_email`. Tem
  `first_response_time_minutes`, `resolution_time_minutes`, `status`,
  `tipo_cliente` (⚠️ é uma **lista separada por vírgula**, tratar com
  `ILIKE %tag%`, nunca igualdade exata), `link_chamado`.
- `crisp_messages` — mensagem a mensagem (`origin`, `operator_crisp_id`);
  base real para calcular a primeira resposta **humana** (excluindo bot).
- `atendente_aliases` — normaliza atendentes que são o mesmo (ex: "IA
  Greenn" e "Mateus Lansa") para estatísticas/ranking.
- `crisp_ratings`, `nps_followups`, view `analytics_sac` — **schema
  paralelo, reservado, com 0 linhas** (ver decisão arquitetural na seção
  14). Não usar como fonte de dado hoje.

**Missões / gamificação**
- `missions` (`DbMission`) — categoria, dificuldade, meta/unidade,
  responsável opcional, status de workflow (`rascunho`/`ativa`/
  `pausada`/`concluida`/`expirada`). Campo `xp`/`moedas` existem no schema
  mas **XP foi removido da UI** (ver ROADMAP.md).
- `mission_progress` (`DbMissionProgress`) — progresso por usuário; trigger
  `ensure_mission_progress` garante a linha ao definir responsável.

**Conteúdo administrável**
- `announcements` (`DbAnnouncement`) — comunicados/Atualizações (categoria,
  prioridade, fixado). Missões e Helpdesks geram announcements
  automaticamente via trigger.
- `tools` (`DbTool`) — "Outros Links" (ícone dinâmico via lucide-react,
  imagem opcional via bucket Storage `tool-images`).
- `courses` (`DbCourse`) / `course_progress` (`DbCourseProgress`).
- `documentation` (`DbDocumentation`).

**Módulos de indicadores próprios**
- `reclame_aqui_cases` (`DbReclameAquiCase`) / `reclame_aqui_metrics`
  (`DbReclameAquiMetric`) — dados de exemplo hoje, sem integração real.
- `nps_responses` (`DbNpsResponse`) — idem; ver `nps_followups` acima
  (decisão pendente sobre qual é a fonte definitiva).
- `helpdesks` (`DbHelpdesk`) — fluxo `fila → pendente → em_progresso →
  criado`/`rejeitado`, imposto no banco; link validado por check
  constraint (`https://greenn.crisp.help/pt-br/...`).
- `rr_history` (`DbRRHistory`) — Reunião de Resultados, campos qualitativos
  preenchidos manualmente.
- `user_status` (`DbUserStatus`) — Colaboradores Online (status +
  horário), um registro por usuário.

**Calendário** (6 tabelas dedicadas): `calendar_holidays`,
`calendar_week_responsibles`, `calendar_saturday_oncall`,
`calendar_leave_requests`, `calendar_oncall`, `calendar_vacations`,
`calendar_day_entries`.

## 8. Relação entre as tabelas

- `users.role_id → roles.id` (perfil).
- `users.auth_id → auth.users.id` (Supabase Auth, fora do schema `public`).
- `user_permissions.user_id → users.id`, `user_permissions.module_id →
  modules.id`.
- `missions.responsavel_id → users.id` (opcional); `mission_progress.mission_id
  → missions.id`, `mission_progress.user_id → users.id`.
- `course_progress.user_id → users.id`, `course_progress.course_id →
  courses.id`.
- `csat_results.user_id → users.id`, mas **sempre NULL na prática** — o
  join real que funciona é por e-mail: `csat_results.email_atendente =
  users.email`. Mesma lógica para `crisp_conversations.operator_email`.
- `csat_results.crisp_id` deveria correlacionar com uma conversa do Crisp,
  mas está **100% nulo** no pipeline atual — funções que dependiam disso
  (`csat_tempo_resposta_correlacao`, `conversas_nota_baixa`) ficam vazias.
- `reclame_aqui_cases.responsavel_id → users.id`.
- `helpdesks.created_by → users.id`, `helpdesks.approved_by → users.id`.
- `user_status.user_id → users.id` (1:1).
- `rr_history.user_id → users.id`.

Não há uma tabela de "chamados" separada — `csat_results` representa
interações já avaliadas; `crisp_conversations` é a lista mais ampla de
conversas (avaliadas ou não).

## 9. Como funciona a integração com o Supabase

- **Client único**: `src/integrations/supabase/client.ts`. Nunca instanciar
  outro client em outro lugar do código.
- **Toda leitura/escrita de negócio passa por `src/services/api.ts`** —
  funções nomeadas `fetchX`/`upsertX`/`deleteX`/`createX` que encapsulam
  `.from("tabela").select(...)` ou `.rpc("funcao_sql", params)`. Cálculos
  pesados (médias, agregações, rankings) são feitos por funções SQL
  `security definer` no Postgres, chamadas via `.rpc(...)` — nunca
  recalculados no cliente.
- **RLS é a barreira real de segurança**, não o frontend. Qualquer nova
  função em `api.ts` deve assumir que a política de RLS da tabela já
  decide quem lê/escreve o quê; o frontend só evita mostrar UI que o
  usuário não conseguiria usar de qualquer forma.
- **Realtime**: cada domínio que precisa atualizar sozinho tem um hook
  dedicado em `src/hooks/useRealtime*.ts`. Padrão:
  ```ts
  const channel = supabase
    .channel("nome-do-canal")
    .on("postgres_changes", { event: "*", schema: "public", table: "..." },
        () => queryClient.invalidateQueries({ queryKey: [...] }))
    .subscribe();
  // cleanup: supabase.removeChannel(channel)
  ```
  Hooks existentes: `useRealtimeUserStatus`, `useRealtimeCsat`,
  `useRealtimeConversas`, `useRealtimeHelpdesks`, `useRealtimeCalendario`,
  `useRealtimeAnnouncementsNotifier` (este último toca som via
  `notificationSound.ts` e atualiza o contador do sino no Header). A
  tabela precisa estar na publicação `supabase_realtime` no Postgres para
  o canal funcionar — isso é configurado no banco, não no frontend.
- **Storage**: bucket `tool-images` (leitura pública, escrita só admin),
  usado por `uploadToolImage()` para imagens de "Outros Links".
- **Nenhuma migration está neste repositório** — mudanças de schema são
  aplicadas diretamente no projeto Supabase. Ver risco na seção 20.

## 10. Como funciona a integração com o Crisp

**Não há integração direta com a API do Crisp neste código.** O Crisp é a
ferramenta de chat/atendimento ao cliente da Greenn; um **pipeline externo
via n8n** (fora deste repositório) lê o Crisp e escreve periodicamente nas
tabelas `csat_results`, `crisp_conversations` e `crisp_messages` do
Postgres. O frontend só lê essas tabelas — nunca chama a API do Crisp.

Pontos relevantes para quem for mexer nessa integração:
- `csat_results` = avaliações de satisfação (nota, comentário do cliente).
- `crisp_conversations` = conversas/atendimentos, com tempos.
- `crisp_messages` = granularidade de mensagem, usada só para calcular a
  primeira resposta humana (função interna
  `_primeiras_respostas_humanas()`, não exposta via API).
- O vínculo confiável com o colaborador é sempre por **e-mail**
  (`email_atendente` / `operator_email`), nunca por `user_id`.
- `tipo_cliente` em `crisp_conversations` é uma lista de tags separada por
  vírgula — sempre filtrar com `ILIKE %tag%`.
- Botão "Ver chamado" (Atendimentos) abre `crisp_conversations.link_chamado`,
  coluna nova ainda não populada pelo n8n hoje — só aparece se o link
  existir.
- `crisp_ratings` e a view `analytics_sac` são um schema **alternativo**,
  aparentemente preparado para uma futura integração direta com a API do
  Crisp (sem n8n no meio) — está vazio e **intocado**; não migrar para lá
  sem decisão explícita (ver seção 14).
- Helpdesks aceita apenas links iniciados em
  `https://greenn.crisp.help/pt-br/` (validado em Zod e por check
  constraint no banco) — é o link da central de ajuda do Crisp, não a API.

## 11. Principais componentes reutilizáveis

Todos em `src/components/ui/`:

- **`Button`** — variantes `primary`/`secondary`/`ghost`/`danger`, tamanhos
  `sm`/`md`. `forwardRef`, aceita todas as props nativas de `<button>`.
- **`Card` / `CardHeader` / `CardTitle` / `CardDescription` /
  `CardContent`** — bloco base de praticamente toda a UI (`rounded-2xl
  border border-sand-line bg-sand-surface`).
- **`Badge`** — tons `neutral`/`success`/`warning`/`danger`/`info`/
  `ausencia`/`brand`, usado para status/categorias em toda a aplicação
  (componente mais reutilizado do projeto, 28+ usos).
- **`Kpi`** — card de indicador com label, valor, delta vs. período
  anterior (seta + cor automática) e ícone opcional;
  `invertDeltaColor` para métricas onde "menor é melhor" (ex: tempo médio).
- **`EmptyState`** — estado vazio padrão (ícone + título + descrição +
  ação opcional), usado em toda listagem sem resultado.
- **`Skeleton` / `CardSkeleton`** — loading state padrão (`animate-pulse`).
- **`Avatar`** — iniciais + cor determinística por hash do nome (paleta
  fixa de 5 cores), tamanhos `sm`/`md`/`lg`, aceita `statusDot`.
- **`DateRangePopover`** — único componente de filtro de período da
  plataforma (presets de `dateRanges.ts` + intervalo personalizado); usar
  este em vez de reinventar um seletor de data em página nova.
- **`SegmentedControl<T>`** — grupo compacto de opções (ex: granularidade
  diária/semanal/mensal). ⚠️ Está implementado mas **não está sendo usado
  em nenhuma tela hoje** — ver ROADMAP.md antes de assumir que está em uso.

Fora de `ui/`: `components/layout/Sidebar.tsx` e `Header.tsx` (chrome fixo,
ver seção 6 para a lógica de seções por permissão),
`components/GlobalSearch.tsx` (busca no Header) e
`components/CollaboratorsOnline.tsx` (seção da Home, Realtime).

## 12. Convenções de código

- **Nomenclatura de dados em português, código em inglês**: nomes de
  variável/função seguem o domínio (ex: `usuarios`, `busca`, `salvando`,
  `abrirEdicao`, `remover`) em português — é o padrão do projeto, manter
  consistência em vez de inglês.
- **`services/api.ts`** é a única porta de entrada para dados. Padrão de
  nomes: `fetchX` (leitura), `fetchAllX` (leitura irrestrita p/ admin,
  quando existe uma versão filtrada por RLS para uso comum), `upsertX`
  (criação/edição — um único registro, decide insert vs. update pela
  presença de `id`), `deleteX`, `createX`/`requestX` para fluxos específicos
  (ex: `requestHelpdesk`, `requestLeave`).
- **Tipos**: `types/database.ts` = espelho literal das tabelas (prefixo
  `Db`, ex: `DbUser`); `types/index.ts` = tipos de UI (hoje majoritariamente
  obsoletos, ver ROADMAP.md — só `AppUser`/`UserRole` estão de fato em
  uso). Ao criar uma tabela nova, o tipo `Db*` vai em `database.ts`; só
  criar um tipo em `index.ts` se realmente precisar de uma forma de
  exibição diferente do formato do banco.
- **Formulários**: sempre React Hook Form + Zod. Padrão:
  ```ts
  const schema = z.object({ campo: z.string().min(1, "mensagem") });
  type FormType = z.infer<typeof schema>;
  const { register, handleSubmit, reset, formState: { errors } } =
    useForm<FormType>({ resolver: zodResolver(schema) });
  ```
- **CRUD em página administrativa**: padrão replicado em todo `pages/admin/*`
  e em módulos com gestão própria (ex: Missões) — busca com `useState` +
  filtro `useMemo`, modal controlado por `dialogAberto`/`editando`, `onSubmit`
  chama `upsertX` seguido de `queryClient.invalidateQueries`, erro em
  `useState<string | null>` exibido inline. Ver `AdminUsuarios.tsx` como
  referência completa.
- **Datas/período**: usar `src/lib/dateRanges.ts`
  (`resolvePeriodo`/`periodoAnterior`/`PeriodoPreset`) para qualquer filtro
  de período — não reimplementar cálculo de intervalo de data numa página
  nova.
- **Duração/tempo**: usar `src/lib/formatDuration.ts`
  (`formatDuration`/`formatDurationFromMinutes`) para qualquer exibição de
  segundos/minutos como texto — não recriar `formatSegundos` local (isso já
  foi um problema resolvido, ver README).
- **Classe CSS condicional**: sempre via `cn(...)` (`src/lib/utils.ts`,
  `clsx` + `tailwind-merge`), nunca concatenação manual de string.
- **Erros de mutação**: padrão local é `try/catch` com `setErro(mensagem)`
  em vez de um sistema global — `ToastContext.mostrarErro` existe e é usado
  em alguns fluxos, mas não é universal; ao adicionar uma mutação nova,
  seguir o padrão já presente na página (a maioria usa erro inline no
  próprio card/modal).
- **`security definer` no Postgres**: qualquer agregação/ranking/cálculo
  que cruze dados de mais de um usuário deve ser uma função SQL, nunca
  buscar tudo e agregar no cliente (motivo: performance e RLS — uma query
  agregada pode expor menos dado bruto do que buscar linha a linha).

## 13. Convenções de UI/UX

- **Paleta**: `forest` (verde, cor de marca — ações primárias, destaque de
  sucesso), `sand` (fundo/superfície neutros), `amber` (alerta/atenção),
  `rust` (erro/perigo), `sky` (informação), `violet` (ausência/férias/
  folga). Definidas em `tailwind.config.ts`, nunca usar cores hex soltas
  no JSX — sempre pelas classes do tema.
- **Tipografia**: Inter (`font-display`/`font-body`), IBM Plex Mono
  (`font-mono`, não usado hoje em nenhuma tela identificada). Tamanhos
  semânticos custom: `text-display`, `text-card-title`, `text-legenda`,
  `text-kpi-lg`, `text-micro`.
- **Raio de borda**: `rounded-xl`/`rounded-2xl` em praticamente todo
  elemento (cards, inputs, botões, modais) — nunca `rounded-none`/`rounded-sm`
  sem motivo.
- **Sombras**: `shadow-card` (base), `shadow-soft`, `shadow-float` (modais,
  sidebar expandida) — não usar `shadow-lg`/`shadow-xl` padrão do Tailwind.
- **Layout de página**: container global `max-w-[1600px]` centralizado
  (`AppLayout.tsx`), sidebar fixa recolhível (72px colapsada, 240px
  expandida, expande no hover ou fixada por clique).
- **Modais**: sempre `fixed inset-0 z-50 flex items-center justify-center
  bg-ink/40 p-4` + `<Card className="w-full max-w-md p-5 shadow-float">`
  (ajustar `max-w-*` conforme o formulário). Não há um componente `<Dialog>`
  genérico — o padrão é replicado manualmente em cada página (oportunidade
  de extração, ver ROADMAP.md).
- **Empty state, loading e erro**: sempre `EmptyState`, `Skeleton`/
  `CardSkeleton`, e mensagem de erro inline em `text-rust-500` — não usar
  `alert()`/spinners genéricos.
- **Cards de indicador**: sempre via `Kpi`, nunca recriar a marcação de
  card com número grande + seta de variação manualmente.
- **Tabelas administrativas**: `<table>` HTML simples dentro de `<Card>`,
  cabeçalho `bg-sand-bg` + `text-xs uppercase`, linhas com `border-t
  border-sand-line`, ações (editar/excluir) alinhadas à direita como
  ícone-botão `h-8 w-8 rounded-lg`.
- **Densidade**: preferir componentes compactos (`SegmentedControl` foi
  criado exatamente para substituir "botões-pill grandes e espaçados" —
  ver comentário no próprio arquivo).

## 14. Padrões de nomenclatura

- **Rotas**: kebab-case em português (`/meu-painel`, `/reuniao-resultados`,
  `/outros-links`, `/reclame-aqui`).
- **Componentes/páginas**: PascalCase, um arquivo por componente
  (`Home.tsx`, `AdminUsuarios.tsx`).
- **Hooks**: `useAlgumaCoisa.ts` (camelCase com prefixo `use`), Realtime
  sempre `useRealtime<Dominio>.ts`.
- **Tabelas do banco**: snake_case em português/inglês misto conforme o
  domínio original (`csat_results`, `mission_progress`,
  `calendar_leave_requests`) — seguir o padrão já usado no domínio ao
  criar uma tabela nova (calendário usa prefixo `calendar_`, por exemplo).
- **Tipos `Db*`**: sempre prefixo `Db` + nome da entidade em PascalCase
  singular (`DbUser`, `DbCsatResult`), espelhando 1:1 os campos da tabela
  (snake_case do Postgres viram propriedades também snake_case no tipo —
  não há conversão para camelCase).
- **Funções em `api.ts`**: verbo + entidade, ver seção 12
  (`fetchX`/`upsertX`/`deleteX`). Filtros complexos recebem um objeto
  `XFilters` tipado (ex: `AnalyticsFilters`, `OperadorFilters`,
  `NpsFilters`), não uma lista longa de parâmetros posicionais.
- **Slugs de permissão**: snake_case, mesmo valor usado em
  `modules.slug`, no argumento de `RequirePermission` e em
  `has_permission()` no banco (`csat`, `reclame_aqui`, `nps`, `links`...).

## 15. Fluxo para adicionar novas páginas

1. Criar o componente em `src/pages/NomeDaPagina.tsx` (ou
   `src/pages/admin/AdminNomeDaPagina.tsx` se for administrativa).
2. Registrar a rota em `src/App.tsx`, dentro do bloco `<Route
   element={<AppLayout />}>` (autenticado). Se for admin-only, envolver em
   `<Route element={<AdminOnlyRoute />}>`; se depender de permissão
   granular, em `<Route element={<RequirePermission slug="..." />}>`.
3. Se a página deve aparecer na sidebar, adicionar em
   `src/components/layout/Sidebar.tsx` — na seção certa (`sacItems` para
   área comum, bloco condicional `hasPermission(...)` para módulo com
   permissão granular, ou bloco `isAdmin` para área de administradores).
4. Buscar dados só via funções novas/existentes de `src/services/api.ts`
   (nunca `supabase.from` direto na página) — criar as funções necessárias
   lá primeiro, seguindo a convenção `fetchX`.
5. Reaproveitar `Card`, `Kpi`, `Badge`, `EmptyState`, `Skeleton`,
   `DateRangePopover` antes de criar marcação nova.
6. Se a página precisa atualizar sozinha quando o dado muda no banco,
   verificar se já existe um `useRealtime*` para a tabela envolvida; se
   não existir, criar um novo hook seguindo o padrão da seção 9 **e**
   confirmar que a tabela está na publicação `supabase_realtime` no banco.

## 16. Fluxo para adicionar novas tabelas

1. Definir e aplicar o schema diretamente no projeto Supabase
   ("Centralização - SAC") — colunas, constraints, RLS. **Isto acontece
   fora deste repositório**; documentar aqui (seção 7) o que foi criado.
2. Adicionar o tipo espelho em `src/types/database.ts`, prefixo `Db`,
   campos snake_case idênticos aos do Postgres. Incluir relações opcionais
   populadas via join (`?: DbOutraTabela`) quando a query fizer
   `select("*, outra_tabela(*)")`.
3. Adicionar as funções de acesso em `src/services/api.ts`
   (`fetchX`/`upsertX`/`deleteX`), sempre delegando qualquer agregação
   pesada para uma função SQL (`security definer`) em vez de trazer todas
   as linhas para o cliente.
4. Se a tabela precisa ser lida em tempo real por mais de um usuário,
   habilitar na publicação `supabase_realtime` do Postgres e criar/estender
   um hook `useRealtime*`.
5. Se a tabela representa um módulo novo (rota própria, ícone na sidebar),
   considerar reservar o slug em `public.modules` mesmo antes de a tela
   existir (padrão já usado — vários slugs foram reservados na Fase 1
   antes do módulo ser implementado).
6. Atualizar este `CLAUDE.md` (seções 7 e 8) com a tabela nova e suas
   relações.

## 17. Fluxo para adicionar novas permissões

1. Garantir que existe uma linha em `public.modules` com o `slug` desejado
   (criar via **Administração → Módulos**, ou diretamente no banco se o
   módulo ainda não tem tela).
2. Proteger a rota com `<Route element={<RequirePermission
   slug="meu_slug" />}>` em `App.tsx`.
3. Na Sidebar, mostrar o item condicionado a `hasPermission("meu_slug")`
   (seguir o padrão do bloco "Módulos com permissão" em `Sidebar.tsx`).
4. No banco, qualquer política de RLS que precise liberar escrita para
   quem tem essa permissão deve chamar `has_permission('meu_slug')` — não
   confiar só no bloqueio de rota do frontend.
5. A concessão/revogação por usuário já funciona automaticamente pela
   tela **Administração → Permissões** assim que o módulo existir em
   `public.modules` — não é necessário código novo para isso.

## 18. Lista dos módulos existentes

| Módulo | Rota | Acesso |
|---|---|---|
| Home | `/` | Todo autenticado |
| Meu Painel | `/meu-painel` | Todo autenticado |
| Missões | `/missoes` | Todo autenticado (gestão completa é admin-only) |
| Analytics | `/analytics` | Todo autenticado (ranking/destaque exige permissão `analytics`* ou admin) |
| Reunião de Resultados | `/reuniao-resultados` | Todo autenticado |
| Cursos | `/cursos` | Todo autenticado |
| Documentação | `/documentacao` | Todo autenticado |
| Atualizações | `/atualizacoes` | Todo autenticado |
| Helpdesks | `/helpdesks` | Todo autenticado (gestão de todas as solicitações é admin/permissão `helpdesks`) |
| Calendário | `/calendario` | Todo autenticado (escrita administrativa é admin-only) |
| Outros Links | `/outros-links` | Todo autenticado |
| Perfil | `/perfil` | Todo autenticado (próprio usuário) |
| CSAT | `/csat` | Permissão granular `csat` ou admin |
| Reclame Aqui | `/reclame-aqui` | Permissão granular `reclame_aqui` ou admin |
| NPS | `/nps` | Permissão granular `nps` ou admin |
| Atendimentos | `/atendimentos` | Admin-only estrito |
| Performance | `/performance` | Admin-only estrito |
| Administração (Usuários, Perfis, Permissões, Escalas, Módulos, Cursos, Documentação, Atualizações, Outros Links) | `/admin/*` | Admin-only estrito |

\* README menciona uma permissão granular "Analytics" para liberar
ranking/destaque; não confirmado se o slug `analytics` está de fato
cadastrado em `public.modules` — conferir antes de assumir.

## 19. Funcionalidades concluídas

- Autenticação via Supabase Auth + perfil vinculado (`public.users`).
- RBAC de dois níveis: perfil (Admin/Colaborador) + permissão granular por
  módulo, reforçada por RLS.
- Colaboradores Online em tempo real (status, sem polling).
- Outros Links com CRUD completo, ícone dinâmico, upload de imagem.
- Missões com criação via modal, claim por colaborador sem responsável,
  gestão admin-only.
- Meu Painel com filtro de período e indicadores pessoais (CSAT, missões,
  cursos, evolução vs. período anterior).
- CSAT como módulo próprio: planilha filtrável + dashboard por
  colaborador + exportação CSV/PDF.
- Analytics avançado: resumo do período, evolução (diária/semanal/
  mensal), ranking de operadores, distribuição por canal/status/tópico,
  tudo com Realtime.
- Reclame Aqui: dashboard, listagem/CRUD, simulador de meta de nota
  (dados de exemplo, sem integração real ainda).
- NPS: score automático, classificação gerada pelo Postgres, evolução
  mensal, CRUD (dados de exemplo, sem integração real ainda).
- Painel Administrativo unificado: CRUD completo para Usuários, Perfis,
  Permissões, Módulos, Cursos, Documentação, Atualizações, Outros Links
  (delete não implementado na UI para Módulos/Perfis — ver ROADMAP.md).
- Atendimentos e Performance (admin-only) sobre `crisp_conversations`
  real, com filtros e Realtime.
- Correção de métricas de 1ª resposta para considerar só resposta humana
  (excluindo bot da Crisp).
- Calendário completo: feriados nacionais automáticos (inclusive móveis),
  grade mensal, plantões, escala de sábado com rodízio, folgas/férias/
  sobreaviso, aprovação de folga por admin, Realtime.
- Horário de trabalho configurável por usuário, descontado automaticamente
  dos indicadores de tempo (Dashboard/Performance).
- Helpdesks com fluxo de status imposto pelo banco, Kanban arrastável para
  admin, geração automática de Atualização ao concluir.
- Notificação sonora + badge de não lidas em tempo real (sino do Header).
- Exportação CSV (CSAT) e PDF (dashboard CSAT).

## 20. Funcionalidades pendentes

Ver **`ROADMAP.md`** para o levantamento detalhado e priorizado (TODOs,
funcionalidades parcialmente implementadas, código morto). Resumo do que é
sabidamente incompleto por decisão de escopo (não é bug):

- Integração real com Crisp/HugMe para Reclame Aqui e NPS (hoje só dados
  de exemplo).
- Reunião de Resultados avançada (comparação semana×semana, exportar PDF,
  copiar relatório).
- Sistema de Tags em Documentação.
- Cache de analytics (`analytics_cache`) e comparativos adicionais.
- Decisão sobre migrar `csat_results`/`crisp_conversations` para o schema
  `crisp_ratings` + `analytics_sac` (hoje vazio e reservado).
- Decisão sobre qual fonte é definitiva para NPS: `nps_responses` (em uso)
  vs. `nps_followups` (schema real, vazia).

## 21. Decisões arquiteturais importantes

- **`csat_results` é a fonte de verdade de satisfação; `crisp_conversations`
  é a fonte de verdade de tempo.** Ambas compartilham e-mail como chave —
  nunca `user_id`. Decisão confirmada e documentada no README após
  investigação; não reverter sem entender por que (ver seção 20 do
  README completo, seção "Decisão de arquitetura: duas modelagens de
  Crisp coexistindo no banco").
- **RBAC de rota estrito para Atendimentos/Performance/Admin**: mesmo tendo
  sistema de permissão granular, essas rotas exigem `is_admin()` puro, por
  decisão explícita de produto — não trocar por `RequirePermission` sem
  confirmar com o time.
- **Cálculos pesados sempre em SQL** (`security definer`), nunca agregados
  no cliente — motivo: performance e menor exposição de dado bruto via
  RLS.
- **RLS é a camada de segurança real**, o frontend é conveniência de UX.
  Qualquer nova tela deve assumir que um usuário mal-intencionado pode
  chamar a API do Supabase diretamente, ignorando a UI.
- **`crisp_conversations`, `crisp_ratings`, `nps_followups`,
  `analytics_sac`**: tabelas/view "paralelas" identificadas pelo advisor de
  segurança do Supabase, deliberadamente deixadas intocadas — reservadas
  para quando existir integração direta com a API do Crisp. Não apagar,
  não migrar sem decisão explícita.
- **Sem servidor próprio**: toda a lógica de backend vive no Postgres
  (funções `security definer`) ou no frontend puro — não introduzir uma
  API Node/Express paralela sem alinhar antes, é uma mudança de
  arquitetura.
- **RBAC do frontend desenhado para crescer**: `AuthContext` e
  `ProtectedRoute` já suportam adicionar novos perfis além de
  Admin/Colaborador sem refatoração estrutural (mas `mapDbUserToAppUser`
  hoje só reconhece dois valores — extensão real exigiria tratar isso).

## 22. Boas práticas que devem ser seguidas neste projeto

- Nunca hardcodar credenciais — sempre via `.env` (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`).
- Nunca acessar `supabase.from(...)`/`supabase.rpc(...)` fora de
  `src/services/api.ts` (exceção: hooks `useRealtime*`, que só assinam
  canais, não leem/escrevem dado de negócio).
- Nunca confiar só na UI para proteger dado sensível — toda regra de
  acesso precisa existir (ou já existir) em RLS/função SQL.
- Nunca usar `csat_results.user_id` para vincular a um colaborador — usar
  e-mail.
- Nunca tratar `crisp_conversations.tipo_cliente` como valor único — é uma
  lista separada por vírgula.
- Nunca reimplementar formatação de duração ou cálculo de período — usar
  `formatDuration.ts`/`dateRanges.ts`.
- Sempre validar formulário com Zod + React Hook Form, nunca validação
  manual solta.
- Sempre reaproveitar os componentes de `components/ui/` antes de criar
  marcação nova equivalente.
- Sempre que uma tela nova buscar dado de mais de um usuário (ranking,
  agregação, dashboard geral), preferir criar/reusar uma função SQL em vez
  de buscar tudo e agregar no cliente.
- Sempre atualizar este `CLAUDE.md` (e o `README.md`, que mantém o
  histórico cronológico de fases) ao concluir uma funcionalidade
  relevante — ver seção 23.
- Nunca inserir dado fictício/de teste diretamente nas tabelas que
  recebem dado real do n8n (`csat_results`, `crisp_conversations`,
  `crisp_messages`) — isso já causou um incidente de dados fictícios em
  produção (ver README). Para demonstração, usar tabelas isoladas ou dado
  claramente marcável.

## 23. O que nunca deve ser alterado sem análise prévia

- **RLS e funções `security definer` no banco** — qualquer alteração pode
  abrir um buraco de segurança silencioso (o frontend não vai acusar erro
  imediatamente).
- **`csat_results` e `crisp_conversations`** — são alimentadas por um
  pipeline n8n externo e ativo, com dados reais de cliente (nome,
  telefone, e-mail). Nunca escrever dado de teste/demonstração ali (ver
  incidente documentado no README). Qualquer alteração de schema precisa
  considerar o pipeline externo que já escreve nessas tabelas.
- **`crisp_conversations`, `crisp_ratings`, `nps_followups`,
  `analytics_sac`** — schema paralelo reservado, deliberadamente intocado.
  Não apagar, não popular com dado fictício, não migrar sem decisão
  explícita do time.
- **Vínculo `users.auth_id`** — já causou dois incidentes de "usuário não
  consegue entrar" quando ficou dessincronizado do Supabase Auth. Ao criar
  um usuário novo, sempre confirmar que o `auth_id` foi vinculado.
- **Guards admin-only de `/atendimentos`, `/performance`, `/admin/*`** —
  decisão de produto explícita, não trocar por permissão granular sem
  confirmar.
- **`helpdesks` — validação de link (`https://greenn.crisp.help/pt-br/`)**
  — existe em duas camadas (Zod + check constraint); alterar uma sem a
  outra quebra a garantia de "não dá pra burlar via API direta".
- **Migrations/schema do Supabase** — não há versionamento local; qualquer
  alteração de schema deve ser cuidadosamente documentada aqui (seções 7
  e 8) já que não há histórico em código para consultar depois.
- **`.env`** — nunca commitar (já está no `.gitignore`); contém as chaves
  do projeto Supabase de produção.

## Como manter este arquivo atualizado

Sempre que uma funcionalidade importante for implementada, alterada ou
removida:
1. Atualizar a seção relevante deste arquivo (módulos, tabelas, decisões,
   pendências) — não só o `README.md`.
2. Se uma tabela nova foi criada ou uma existente mudou de propósito,
   atualizar as seções 7 e 8.
3. Se uma decisão de arquitetura foi tomada (ex: qual tabela é fonte de
   verdade, o que ficou de fora por decisão de produto), registrar na
   seção 21 com o motivo — não só o "o quê".
4. Mover itens da seção 20 (pendentes) para a seção 19 (concluídas) quando
   entregues.
5. Reconsultar `ROADMAP.md` periodicamente: itens resolvidos devem sair de
   lá; achados novos (dead code, TODO, funcionalidade parcial) devem
   entrar.
