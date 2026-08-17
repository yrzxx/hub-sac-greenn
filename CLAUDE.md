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

**Requisito de Node**: Vite 8 exige Node moderno (18+); Node 12 do sistema
(se for o caso do seu ambiente) faz o próprio `tsc` falhar ao carregar
(`SyntaxError` no operador `??`). Use `nvm install 20 && nvm use 20` antes
de rodar `npm install`/`npm run build` se encontrar esse erro.

**Conflito de peer dependency conhecido**: `package.json` tem `"vite":
"^8.2.1"` mas `"@vitejs/plugin-react": "^4.3.1"`, cujo peer range é `vite
^4.2.0 || ^5.0.0 || ^6.0.0 || ^7.0.0` — não cobre vite 8. `npm install`
puro falha com `ERESOLVE`; hoje só instala com `npm install
--legacy-peer-deps`. O build funciona assim na prática, mas vale decidir
conscientemente entre atualizar `@vitejs/plugin-react` para uma versão que
suporte vite 8, ou fixar vite em uma major anterior — não foi uma decisão
tomada, é um estado encontrado.

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

**Rodízio de sábado** (Administração → Escalas, `AdminEscalas.tsx`):
- `escala_sabado` — sequência ordenada (`posicao`) de quem entra no
  rodízio de plantão de sábado.
- `escala_sabado_config` — tabela singleton (1 linha fixa, `id boolean`
  sempre `true`) com `data_referencia`: o sábado a partir do qual a
  `posicao` #1 começa a contar. A função SQL `atendente_escalado_sabado(p_data)`
  calcula `((p_data - data_referencia) / 7) mod count(escala_sabado)` para
  achar quem está escalado numa data. **Sem uma linha em
  `escala_sabado_config` essa função sempre retorna vazio** — ficou sem
  nenhuma linha desde a criação da tabela até 2026-08-14 (ver seção 10),
  o que fazia o rodízio parecer "quebrado" mesmo com gente cadastrada em
  `escala_sabado`. Editável agora em Administração → Escalas.

**Aliases de atendente** (Administração → Aliases de Atendente,
`AdminAtendenteAliases.tsx`): CRUD sobre `atendente_aliases` — antes só
tinha leitura (`fetchAtendenteAliases`, usado no dashboard de CSAT para
juntar e-mails variantes do mesmo atendente); ganhou tela própria em
2026-08-14.

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
- `csat_results.crisp_id` e `csat_results.conversation_id` deveriam
  correlacionar com uma conversa do Crisp, mas os dois estão **100% nulos**
  no pipeline atual — `csat_tempo_resposta_correlacao` ainda depende disso
  e fica vazia. `conversas_nota_baixa()` foi **corrigida em 2026-08-16**
  pra não depender mais desse vínculo: `csat_results` já carrega
  `cliente`/`atendente`/`canal`/`topico`/`comentario`/`link_chamado`
  próprios, então a função passou a ler direto da tabela em vez de fazer
  `join` com `crisp_conversations` por `crisp_id` (que nunca casava
  nenhuma linha). Continua podendo aparecer vazia — mas agora por não
  haver avaliação com nota baixa no período, não por falha de vínculo.
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

**Bug diagnosticado em 2026-08-13 (tempo de 1ª resposta inconsistente):**
`_primeiras_respostas_humanas()` exclui o bot filtrando
`operator_nome not ilike '%IA%'`/`'%bot%'` e `origin not ilike
'%crisp.im:bot%'` em `crisp_messages`. No fluxo n8n `Crisp → Hub`, só o
node `Code - Received` (evento `message:received`) normaliza mensagem
automática pra `operator_nome = "Atendente IA Greenn"` quando
`data.automated === true`. O node `Code - Send` (evento `message:send`,
responsável por criar a conversa e gravar a 1ª mensagem quando é
conversa nova) **não faz essa normalização** — grava o nome cru do bot no
Crisp. Resultado: quando a IA manda a primeira mensagem de uma conversa
nova, ela pode ser contada como "primeira resposta humana", zerando o
tempo de resposta daquela conversa. Fix é no `Code - Send` do n8n (fora
deste repositório): aplicar a mesma normalização `automated === true →
operator_crisp_id = "ia_greenn"`, `operator_nome = "Atendente IA Greenn"`
que já existe no `Code - Received`. Só corrige dado novo — conversas já
gravadas erradas em `crisp_messages` precisam de backfill manual à parte
se necessário. Status: **fix aplicado no `Code - Send` do n8n e validado**
em teste real (2026-08-13). Achado empírico ao checar as 1410 conversas
históricas: a primeira mensagem de **toda** conversa real é sempre do
cliente (`from_type = 'user'`), nunca do bot — nos canais em uso (chat,
email, WhatsApp) o cliente sempre fala primeiro, então esse bug
provavelmente nunca chegou a disparar na prática. O fix foi mantido por
correção/consistência mesmo assim.

**Fix aplicado em 2026-08-13 — `atendente_performance()` contava conversa
sem atendente:** a função agrupava por `crisp_conversations.operator_nome`,
e conversas recém-criadas que ainda não foram tocadas por ninguém (nem bot,
nem humano) têm esse campo `NULL` — aparecia como uma linha "sem nome" no
ranking da tela Performance. Adicionado `and cc.operator_nome is not null`
no filtro da função (aplicado direto via `execute_sql`, sem migration
versionada — ver risco documentado na seção 20/23).

**Fix aplicado em 2026-08-13 — `calendar_holidays` estava vazia:** mesmo
padrão de dano do TRUNCATE, achada ao investigar por que o card "Próximo
feriado" do Calendário não mostrava nada. Repovoada com feriados nacionais
reais do Brasil 2025–2027 (fixos + móveis; Páscoa/Carnaval/Sexta-feira
Santa/Corpus Christi calculados via algoritmo de Gauss/Meeus, não
chutados). `src/pages/Calendario.tsx` também ganhou cores diferentes por
tipo de dia no grid (sábado/domingo/feriado) e emoji temático por feriado
(`emojiFeriado()`).

**Fix aplicado em 2026-08-14 — rodízio de sábado nunca escalava ninguém,
por dois bugs empilhados:** ao auditar a plataforma inteira por dado
faltando, `escala_sabado_config` apareceu com 0 linhas e 0 referências no
frontend, parecendo tabela morta. Na real é uma dependência obrigatória
da função SQL `atendente_escalado_sabado()` (ver seção 7) — sem essa
linha, `data_referencia` é `NULL` e a função sempre retorna vazio,
mascarado atrás do mesmo texto "Sem escala definida" que apareceria se a
sequência estivesse genuinamente vazia. Populada com o default do próprio
schema (`data_referencia = 2026-01-03`) e Administração → Escalas ganhou
um campo para editar essa data (`fetchEscalaSabadoConfig`/
`upsertEscalaSabadoConfig`). Ao verificar no navegador, um **segundo bug
independente** apareceu: o card "Próximos sábados" continuava vazio mesmo
com a config corrigida — `src/pages/admin/AdminEscalas.tsx` recalculava
`proximosSabados(4)` a cada render sem `useMemo`, e como a chave da query
do TanStack Query (`["escalados-sabados", sabados.map(s => s.toISOString())]`)
incluía o horário exato (`toISOString()` carrega milissegundos), a chave
mudava a cada render — a query nunca chegava a `success`, ficava
reiniciando (`fetchStatus: "fetching"` para sempre). Corrigido com
`useMemo` nos sábados e na chave (só as datas ISO, sem hora). Os dois bugs
juntos faziam a tela parecer "sem função de definir atendente de sábado"
mesmo já existindo (o dropdown "Definir plantão de sábado" no
`Calendario.tsx`, por data específica, sempre funcionou — o que estava
quebrado era só a *projeção automática* baseada no rodízio).

**Fix aplicado em 2026-08-15 — Analytics "Total de chamados" mentia (sempre
igual a "Total de avaliações") e o gráfico de evolução vinha sempre vazio:**
achado ao investigar reclamação de que "os dados não estão batendo" entre
Analytics e as outras telas (Performance/Em Risco/Home, que já usavam
`crisp_conversations`). Dois problemas:
1. `src/pages/Analytics.tsx` calculava "Total de chamados" a partir do mesmo
   `analytics_summary()` (que lê só `csat_results`, hoje 8 linhas) usado por
   "Total de avaliações" — por isso os dois KPIs sempre mostravam o mesmo
   número, e o texto da própria tela já admitia isso como limitação
   conhecida. Corrigido: "Total de chamados" agora vem de
   `dashboard_atendimento_summary()` (fonte `crisp_conversations`, hoje
   396 no mês — a mesma função já usada no dashboard da Home), que ganhou
   um parâmetro opcional `p_canal` pra respeitar o filtro de canal da tela.
   Ver decisão arquitetural da seção 21 (as duas tabelas medem populações
   diferentes: todas as conversas vs. só as avaliadas — números diferentes
   são esperados, não um bug em si).
2. `analytics_evolucao()` (gráfico "Evolução de chamados e CSAT") fazia
   `join public.users u on u.id = c.user_id` — e `csat_results.user_id` é
   **sempre `NULL`** na prática (mesmo problema já corrigido em
   `atendente_performance()` em 2026-08-13, que voltou a aparecer aqui
   porque é uma função irmã que nunca recebeu o mesmo fix). O `JOIN` nunca
   casava nenhuma linha, então o gráfico sempre renderizava "Sem dados.",
   mesmo com avaliações reais no período. Corrigido removendo o `JOIN`
   (o parâmetro `p_equipe` que dependia dele nunca era passado pelo
   frontend mesmo, igual já acontecia em `analytics_summary()`).

**Feature nova em 2026-08-15 — Reunião de Resultados mostra dado do time
pra admin:** `ReuniaoResultados.tsx` calculava CSAT/atendimentos/tempo
médio sempre a partir do e-mail do usuário logado — pra um admin (que
normalmente não atende ticket em nome próprio) isso sempre mostrava zero,
inutilizável pra levar pro Meet do time. Agora, quando `isAdmin`, os 3 KPIs
e o registro salvo em `rr_history` usam `dashboard_atendimento_summary()`
(resultado agregado do time inteiro no período) em vez das funções
pessoais (`fetchCsatForUser`/`fetchMinhasConversasMetricas`); colaboradores
sem permissão de admin continuam vendo só o próprio resultado (self-review
continua fazendo sentido pra esse público).

RR ganhou um conjunto de recursos no mesmo dia: edição (`updateRRHistory`,
só corrige o texto qualitativo, não os números recalculados no momento do
save), exclusão **admin-only** (`deleteRRHistory` + policy nova
`rr_history_delete_admin` — decisão revertida ainda no mesmo dia: a policy
de `DELETE` foi adicionada de propósito, colaborador comum continua sem
poder apagar o próprio histórico, só admin), campos "Plano de ação" e
"Objetivos" viraram opcionais no formulário (só "Aprendizados" e
"Dificuldades" continuam obrigatórios), exportação em PDF (histórico
inteiro ou uma RR específica, `exportRRHistoricoToPdf`/`exportRRUnicaToPdf`
em `src/lib/exportPdf.ts`), um dialog de visualização ao clicar num card do
histórico (mostra tudo, com botões Editar/Excluir/Baixar PDF), e uma nova
seção "Detalhamento por atendente" (admin-only) com chamados/avaliações/
CSAT por atendente comparado ao período anterior — mensal ou semanal via
`SegmentedControl`, reaproveitando `fetchAtendentePerformance` (já usada em
Performance.tsx) em vez de criar função SQL nova.

**Colunas ordenáveis em 2026-08-15/16 — clique no cabeçalho, `SortableHeader`:**
adicionado `src/components/ui/SortableHeader.tsx` (ícone de seta, alterna
asc/desc no clique, reseta pra direção padrão do campo ao trocar de coluna).
Substituiu o antigo seletor "Ordenar por" dentro do popover de Filtros em
Em Risco. `atendimentos_com_metricas()` ganhou parâmetro `p_direcao` (antes
cada modo de ordenação tinha uma direção fixa no SQL). Aplicado em: Em Risco
(Aberto desde, Tempo até 1ª resposta), Performance → aba Atendimentos
(Início, Tempo até 1ª resposta, Resolução) e nas duas tabelas de ranking
(Performance → Ranking, Analytics → Ranking de operadores) — essas duas
últimas ordenam **no cliente** (`Array.sort` num `useMemo`), sem mudança de
SQL, porque já carregam a lista inteira de uma vez (sem paginação).

**Fix arquitetural em 2026-08-16 — tempo útil passou a ser "cobertura do
time", não "jornada de quem respondeu":** `minutos_uteis_entre(p_inicio,
p_fim, p_entrada, p_almoco_saida, p_almoco_volta, p_saida)` calculava tempo
descontando fora-de-expediente usando a jornada cadastrada de UM atendente
específico (`horario_por_nome(atendente)`, geralmente quem respondeu
primeiro) — quebrava exatamente no caso de handoff de plantão: se o
chamado chegava às 18h e só era respondido depois por alguém cuja jornada
cadastrada termina às 17h, o sistema contava 18h–20h como "fora de
expediente" mesmo com outro atendente de plantão nesse horário (ex:
Brenda tem jornada até 20h cadastrada). Substituído por
`minutos_uteis_entre_time(p_inicio, p_fim)`: calcula a **união das jornadas
de todos os usuários ativos** (`range_agg`/multirange do Postgres 14+) —
qualquer momento em que PELO MENOS UM atendente cadastrado está de plantão
conta como "útil", refletindo o rodízio real do time em vez da jornada
individual de quem por acaso atendeu. Sábado continua com janela fixa
08h–12h (plantão à parte, não depende de `horario_*` de ninguém — ver
seção 7). Também eliminou o fallback problemático de 08h–17h que era usado
pra atendentes sem conta no Hub (ex: "Ana", só existe como texto livre no
Crisp) — agora eles simplesmente não contribuem pra união, e o horário
depende só de quem *tem* conta e jornada cadastrada (hoje: Eduardo
08h–17h, Brenda 10h–20h — union resulta numa cobertura contínua 08h–20h
nos dias úteis, sem buraco, porque os almoços são escalonados).
`atendimentos_com_metricas`, `dashboard_atendimento_summary`,
`atendente_performance` e `minhas_conversas_metricas` foram atualizadas
pra chamar a nova função (removido o `left join lateral
horario_por_nome(...)` de todas elas). Verificado manualmente com o caso
real "Rodrigo De Oliveira Borges" (chamado sexta 20:04, resposta sábado
10:20 → 2h20min27s corretos nos dois modelos, coincidência de a resposta
cair fora até da jornada mais longa) e um caso sintético 18h–19h de sexta
(sob o modelo antigo daria 0min se o responder não tivesse jornada até
lá; no modelo novo dá 60min corretos, cobertos pela jornada da Brenda).
Limpeza: junto com essa mudança, foram removidas ~5 sobrecargas (overloads)
mortas de `atendimentos_com_metricas`/`dashboard_atendimento_summary` que
tinham se acumulado de assinaturas antigas ao longo da sessão (o Postgres
identifica função por nome+tipos de parâmetro, então mudar a assinatura via
`CREATE OR REPLACE` várias vezes cria uma nova sobrecarga a cada vez em vez
de substituir, se os tipos mudarem).

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
  diária/semanal/mensal, abas internas de página). Em uso em Analytics,
  CSAT, Atualizações e Reclame Aqui.
- **`Dialog`** — wrapper padrão para modais (`onClose` + conteúdo livre),
  substitui o markup `fixed inset-0 ... bg-ink/40` + `<Card>` que era
  replicado manualmente em ~11 páginas. Fecha com Escape ou clique no
  backdrop, e expõe `role="dialog"`/`aria-modal`. Usar sempre este
  componente para novos modais — não recriar o markup manual.

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
- **Modais**: usar `<Dialog onClose={...}>` (`src/components/ui/Dialog.tsx`)
  envolvido pelo `{condicao && <Dialog>...}` do estado local — não recriar o
  markup `fixed inset-0 ... bg-ink/40` manualmente. Passe `className` para
  ajustar `max-w-*`/altura quando o formulário for maior que o padrão
  (`max-w-md`).
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
| Performance | `/performance` | Admin-only estrito (inclui a aba "Atendimentos", que era uma página própria `/atendimentos` até ser incorporada aqui) |
| Em Risco | `/em-risco` | Admin-only estrito — chamados abertos ordenáveis por tempo em aberto/TFR, com filtros de atendente/status/canal e exportação CSV |
| Administração (Usuários, Perfis, Permissões, Escalas, Aliases de Atendente, Módulos, Cursos, Documentação, Atualizações, Outros Links) | `/admin/*` | Admin-only estrito |

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
- Painel Administrativo unificado: CRUD completo (incluindo exclusão) para
  Usuários, Perfis, Permissões, Módulos, Cursos, Documentação,
  Atualizações, Outros Links.
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
- Dashboard de atendimento na Home (5 cards + evolução diária, admin-only),
  usando `fetchDashboardAtendimentoSummary`/`fetchConversasEvolucao` que
  antes existiam em `api.ts` sem nenhuma tela consumindo.
- Exclusão (delete) wired na UI de Administração → Módulos, → Perfis e em
  Helpdesks (funções já existiam em `api.ts`, sem botão correspondente).
- Reunião de Resultados usando tempo médio de resolução real
  (`crisp_conversations`, via `fetchMinhasConversasMetricas`), substituindo
  o aviso de "tempo não registrado".
- Componente `Dialog` (`src/components/ui/Dialog.tsx`) extraído e adotado
  em todos os modais da aplicação (Escape, clique no backdrop,
  `aria-modal`).
- Build de produção (`npm run build`) verificado ponta a ponta pela
  primeira vez neste projeto — corrigidos os erros de tipo que o `tsc -b`
  nunca tinha rodado a tempo de pegar (closures de `supabase` possivelmente
  nulo nos hooks `useRealtime*`, campo `email` faltante em `DbCsatResult`,
  imports não usados, inferência de tipo em `fetchMyPermissions`).
- Status "online" automático no login (`ensureOnlineStatus`), sem o que a
  seção Colaboradores Online da Home nunca tinha dado nenhuma pra mostrar —
  ninguém tinha motivo pra abrir o popover manual de status.
- Alerta no Calendário quando a semana atual está sem responsável definido
  (banner + KPI destacado, admin-only).
- Tela própria para gerenciar `atendente_aliases` (Administração → Aliases
  de Atendente), CRUD completo — antes só existia leitura, sem UI.
- Exportação CSV da lista "Em Risco" (respeita os filtros ativos).
- Rodízio de sábado corrigido (`escala_sabado_config` populada + bug de
  `useMemo` em `AdminEscalas.tsx`) e ganhou campo para editar a data de
  referência — ver seção 10 para o diagnóstico completo.
- Reunião de Resultados corrigida (fonte errada de dados: CSAT/atendimentos
  zerados pra admin) e Analytics corrigido (KPI "Total de chamados" que
  sempre repetia "Total de avaliações", gráfico de evolução sempre vazio
  por `JOIN` num campo sempre nulo) — ver seção 10.
- RR ganhou edição, exclusão admin-only, campos opcionais (plano de
  ação/objetivos), exportação em PDF (histórico ou RR única), dialog de
  visualização por card, e detalhamento por atendente (chamados/avaliações
  x período anterior, mensal ou semanal) — ver seção 10.

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
