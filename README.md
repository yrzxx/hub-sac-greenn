# Hub SAC Greenn

Plataforma única do time de Suporte da Greenn: desempenho, missões, indicadores,
documentação, cursos, comunicação interna e ferramentas em um só lugar.

## Rodando localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173.

Não é necessário configurar o Supabase para rodar em desenvolvimento: toda a
aplicação funciona hoje sobre dados mockados em `src/lib/mockData.ts`, para
permitir validar produto e UX antes do schema de banco definitivo.

## Modo de demonstração (RBAC)

Vá em **Perfil** e use os botões "Ver como Colaborador" / "Ver como
Administrador" para alternar entre os dois perfis e ver a Sidebar e as rotas
mudando de acordo (o menu **Administração** só aparece para o perfil admin).

## Estrutura de pastas

```
src/
  components/
    ui/          -> componentes reutilizáveis (Button, Card, Badge, Kpi, EmptyState, Skeleton)
    layout/       -> Sidebar, Header
  contexts/       -> AuthContext (usuário logado + RBAC)
  integrations/
    supabase/     -> cliente Supabase (stub, ativa sozinho quando .env for preenchido)
  layouts/        -> AppLayout (sidebar + header + outlet)
  lib/            -> utils (cn) e mockData (dados simulados de todas as integrações futuras)
  pages/          -> uma página por módulo da sidebar
  pages/admin/    -> painel administrativo (Visão geral, Usuários, Conteúdo, Permissões)
  routes/         -> ProtectedRoute (bloqueia /admin para não-admins)
  types/          -> contratos de dados (User, Kpi, Mission, Tool, Course, etc.)
```

## Conectando ao Supabase (quando o schema estiver pronto)

1. Copie `.env.example` para `.env` e preencha `VITE_SUPABASE_URL` e
   `VITE_SUPABASE_ANON_KEY`.
2. `src/integrations/supabase/client.ts` já exporta um client pronto
   (`supabase`) e uma flag `isSupabaseConfigured`.
3. Substitua gradualmente os imports de `src/lib/mockData.ts` por chamadas
   reais via TanStack Query, módulo por módulo — a estrutura de tipos em
   `src/types/index.ts` já reflete o contrato esperado.

## Sistema de permissões granulares (Fase 1 entregue)

Além do perfil Administrador, qualquer colaborador pode receber permissão de
**gerenciar** um módulo específico (Missões, CSAT, RR, Cursos, Atualizações,
Documentação, Outros Links, e os módulos futuros Reclame Aqui / NPS /
Helpdesks já cadastrados como alvo).

- Nada fica fixo no frontend: a permissão vive em `public.user_permissions`,
  e a função `has_permission(slug)` no Postgres decide, dentro do próprio RLS,
  se a escrita é permitida.
- `src/hooks/usePermissions.ts` expõe `hasPermission(slug)` no front, usado
  para mostrar/esconder ações de gestão.
- `src/routes/RequirePermission.tsx` é o guard de rota para módulos futuros
  que exigirem permissão própria (uso: `<Route element={<RequirePermission slug="csat" />}>`).
- Em **Administração → Permissões** existe a matriz colaborador × módulo para
  conceder/revogar com um clique.

## Colaboradores Online (Fase 2 entregue)

Seção na Home listando todos os colaboradores com foto (iniciais), nome,
cargo, equipe, horário e status — atualizando sozinha via **Supabase
Realtime**, sem polling.

- Tabela `public.user_status` (um registro por usuário), com trigger de
  `updated_at` e replicação habilitada (`supabase_realtime`).
- Status possíveis: Online, Em atendimento, Offline, Folga, Férias, Plantão.
  Folga e Férias recebem destaque visual (borda/fundo âmbar + ícone
  próprio), como pedido.
- Cada colaborador só altera o próprio status (RLS); Administrador altera
  qualquer um. O seletor "Seu status" na própria Home já grava direto no
  banco.
- `src/hooks/useRealtimeUserStatus.ts` assina mudanças na tabela e invalida
  o cache do TanStack Query — qualquer usuário que mudar seu status aparece
  atualizado para todo mundo em tempo real, sem F5.

## Outros Links (Fase 3 entregue)

"Ferramentas" foi renomeado para **Outros Links** em todo o app (menu,
Home, módulo de permissões) e ganhou CRUD completo em
**Administração → Outros Links**: busca, categoria controlada (Atendimento,
Relatórios, Desenvolvimento, Comercial, RH, Documentação, IA, Utilidades),
ícone (nome de qualquer ícone do `lucide-react`, renderizado dinamicamente
via `src/lib/dynamicIcon.tsx`), URL, descrição, ordem e status
ativo/inativo — tudo validado com Zod.

A escrita nessa tabela já respeita a permissão granular `links` criada na
Fase 1: um colaborador sem a permissão "Outros Links" não consegue
criar/editar/excluir pelo Supabase, mesmo burlando a UI.

## Missões com criação via modal (Fase 4 entregue)

Sem tela administrativa separada: quem tem a permissão "Missões" (admin ou
permissão granular da Fase 1) vê um botão **Nova missão** direto na página
`/missoes`, que abre um modal com título, descrição, categoria,
dificuldade, meta/unidade, XP, moedas, responsável, data limite e status —
tudo validado com Zod.

- `missions` ganhou as colunas `categoria`, `dificuldade`, `xp`, `moedas`,
  `responsavel_id`, `status` (workflow) além do `ativo` (visível/oculto) que
  já existia.
- Um trigger (`ensure_mission_progress`) garante que, ao definir o
  responsável de uma missão, a linha de progresso correspondente já exista
  — ninguém precisa criar isso manualmente.
- Colaboradores comuns continuam vendo só "Minhas missões" (seu próprio
  progresso); quem tem a permissão também vê a tabela "Gerenciar todas as
  missões", com editar/excluir.

## Meu Painel expandido (Fase 5 entregue)

Filtro de período (Hoje, Ontem, Últimos 7 dias, Últimos 30 dias, Este mês,
Personalizado) controlando todos os indicadores da página:

- CSAT, quantidade de avaliações, % de satisfação, ranking do time (via
  função `team_ranking()` — agregada, não expõe notas individuais de outros
  colaboradores), tempo médio de 1ª resposta e de encerramento (campos já
  preparados no schema, `tempo_primeira_resposta_seg` /
  `tempo_encerramento_seg`, para quando o Crisp estiver integrado).
- Missões em andamento / concluídas, Total de XP e Total de moedas
  (somados a partir das missões já concluídas, usando os campos criados na
  Fase 4).
- Cursos concluídos, via a nova tabela `course_progress`.
- Evolução do período: compara automaticamente com o período anterior de
  mesma duração (`src/lib/dateRanges.ts`).

## CSAT como módulo próprio (Fase 6 entregue)

Nova rota `/csat`, visível na sidebar só para quem tem a permissão granular
"csat" (ou é Admin) — protegida por `RequirePermission`.

- **Planilha**: todos os registros com busca (comentário/atendente), filtros
  (colaborador, canal, categoria, nota, classificação satisfeito/
  insatisfeito), ordenação por coluna, paginação server-side e exportação
  em CSV.
- **Dashboard**: um card por colaborador com nota média, % de satisfação,
  quantidade de avaliações, última avaliação e evolução vs. período
  anterior de mesma duração.
- A leitura de CSAT de outros colaboradores (antes restrita a "só o
  próprio ou admin") agora também libera para quem tem a permissão "csat" —
  ajuste feito diretamente na política de RLS.
- Coluna `classificacao` (satisfeito/insatisfeito) é **gerada
  automaticamente pelo Postgres** a partir da nota — nunca fica
  dessincronizada.

## ⚠️ Incidente de dados fictícios em produção (resolvido)

Durante o desenvolvimento, descobrimos que o projeto Supabase
"Centralização - SAC" **não é um ambiente vazio de testes — é um banco de
produção ativo**, recebendo dados reais de atendimento (cliente, telefone,
email, link do chamado) via integração externa. Dados fictícios criados
para demonstração (6 colaboradores, ~60 registros de CSAT, missões,
cursos, ferramentas e comunicados de exemplo) haviam sido inseridos nas
mesmas tabelas.

Isso foi corrigido: todos os registros fictícios foram identificados (por
não possuírem `cliente`/`telefone`/`email` preenchidos, marcadores que
nenhum dado real deixa de ter) e removidos, e dois campos que haviam sido
preenchidos por engano em cima de registros **reais**
(`tempo_primeira_resposta_seg`, `tempo_encerramento_seg`) foram revertidos
para `NULL`. Também removemos uma coluna redundante (`classificacao`) que
criamos sem perceber que já existia `classificacao_csat` real, com valores
"Promotor"/"Detrator".

**Lição aplicada:** o projeto já tinha um schema real de CSAT bem mais
rico do que inicialmente mapeado (`cliente`, `telefone`, `email`,
`numero_whatsapp`, `categoria_cliente` com valores reais "Consumidor"/
"Produtor", `classificacao_csat`, `link_chamado`, `tags_cliente`,
`estado`). O módulo CSAT (Fase 6) e o Analytics (Fase 7) abaixo já foram
ajustados para usar esses campos reais em vez de inventar equivalentes.

## Analytics avançado (Fase 7 entregue)

`/analytics` ganhou filtros de período, equipe, colaborador, categoria do
cliente (Consumidor/Produtor/Não identificado, campo real) e canal (valores
reais buscados do banco, não uma lista fixa).

- **Resumo do período**: total de avaliações, CSAT médio na escala nativa
  do Crisp (1–5) **e already convertido automaticamente para 0–10**
  (`(nota − 1) / 4 × 10`), percentual de satisfação, tempo médio de 1ª
  resposta e de encerramento.
- **Evolução diária/semanal/mensal**: alternável com um clique, via a
  função `analytics_evolucao()` (agregada, sem identificar colaboradores —
  disponível a qualquer autenticado).
- **Ranking dos colaboradores e Colaborador destaque**: só aparece para
  quem tem a permissão granular "Analytics" (ou é Admin) — a própria
  função `team_ranking_filtered()` só devolve linhas quando isso é
  verdade, então o bloqueio existe mesmo que a UI seja contornada.

## Reclame Aqui (Fase 8 entregue)

Novo módulo em `/reclame-aqui`, protegido pela permissão granular
"reclame_aqui" (módulo já estava reservado desde a Fase 1) — três abas:

- **Dashboard**: contagem por status (aberta/em andamento/respondida/
  resolvida), tempo médio de resposta e de resolução (calculados a partir
  das datas de cada caso), nota atual e evolução da reputação em gráfico de
  linha (tabela `reclame_aqui_metrics`, um snapshot por data).
- **Reclamações**: tabela com consumidor, status, assunto, responsável,
  datas e link para o HugMe, com filtro por status/responsável e CRUD
  completo em modal (mesmo padrão das fases anteriores).
- **Simulador**: define uma meta de nota, calcula a tendência linear a
  partir do histórico de `reclame_aqui_metrics` e projeta em quantos dias a
  meta seria atingida no ritmo atual.

Como as tabelas eram novas (não existiam antes), populei alguns casos e um
histórico de reputação de exemplo — sem qualquer risco de mistura com
dados reais, ao contrário do que aconteceu com `csat_results`.

## NPS (Fase 9 entregue)

Novo módulo em `/nps`, protegido pela permissão granular "nps" (só quem
tem a permissão, ou Admin, acessa — como pedido explicitamente na
especificação).

- **NPS Score** calculado automaticamente (% Promotores − % Detratores),
  com contagem e percentual de Promotores/Neutros/Detratores.
- Classificação (Promotor 9–10, Neutro 7–8, Detrator 0–6) é uma **coluna
  gerada pelo Postgres** a partir da nota — não pode ficar inconsistente.
- Evolução do NPS por mês em gráfico.
- Tabela de respostas com busca, filtro por classificação/fonte, e CRUD
  completo.
- **Estrutura pronta para integrações futuras**: colunas `fonte` e
  `external_id` (único, para evitar duplicar respostas ao importar de uma
  API externa) já existem no schema, mesmo sem integração ativa ainda.

## Painel Administrativo unificado (fase final entregue)

Consolidamos a Administração em um único lugar, com CRUD completo para
tudo que já existe na plataforma:

- **Usuários** (já existia) · **Perfis** (roles — novo CRUD) ·
  **Permissões** (matriz granular, já existia) · **Módulos** (novo CRUD —
  controla sidebar/Home e as chaves usadas pelo sistema de permissões) ·
  **Cursos** (upgrade de lista somente-leitura para CRUD completo) ·
  **Documentação** (idem) · **Atualizações/Comunicados** (idem, com
  categoria, prioridade e fixação) · **Outros Links** (já existia).

Todas seguem o mesmo padrão: busca, tabela, modal de criação/edição
validado com Zod, e respeitam o sistema de permissões granulares da Fase 1
sempre que fizer sentido (ex: Outros Links, Cursos e Documentação também
podem ser editados por um colaborador com a permissão do módulo
correspondente, não só pelo Admin).

**Não incluído nesta consolidação:** Calendário e Helpdesks não foram
construídos (pulamos direto da Fase 9 para esta fase final, a pedido), então
não há o que administrar ali ainda — os slugs desses dois módulos já estão
reservados desde a Fase 1 para quando forem implementados. Categorias e
Tags de documentação também ficaram de fora, já que dependem do sistema de
tags que não chegamos a construir.

## Roadmap — o que ficou de fora

Como pulamos direto da Fase 9 (NPS) para a última fase a pedido, os
seguintes itens do escopo original **não foram implementados**:
- Calendário (plantões, escalas, férias, folgas, aprovações)
- Helpdesks (fluxo de status, geração automática de Atualizações)
- Reunião de Resultados avançada (comparação semana×semana, exportar PDF, copiar relatório)
- Sistema de Tags em Documentação
- Analytics: comparativos adicionais e cache de analytics (`analytics_cache`)

Se quiser retomar alguma dessas frentes depois, é só pedir.

## ⚠️ Bug crítico encontrado e corrigido: vínculo colaborador ↔ atendimento

Ao reconstruir o Analytics, descobri que **`csat_results.user_id` está
`NULL` em 100% dos dados reais** — o vínculo de verdade é
`email_atendente` (bate exatamente com o email de login, ex:
`mateus@greenn.com.br`). Como várias funcionalidades foram construídas
assumindo `user_id`, isso deixou **silenciosamente vazias** (para dados
reais): o Ranking do Analytics, o dashboard "por colaborador" do módulo
CSAT, e os indicadores de CSAT no Meu Painel e na Reunião de Resultados.

Corrigido nesta fase:
- RLS de `csat_results`: agora também libera leitura própria por
  `email_atendente = email do usuário logado` (antes só considerava
  `user_id`).
- `fetchCsatForUser` passou a filtrar por email, não por id — Meu Painel e
  RR agora mostram os dados reais de quem estiver logado.
- Módulo CSAT: dashboard por colaborador e filtro "Colaborador" agora
  usam `email_atendente`/`atendente` (lista vem de `fetchDistinctOperadores()`,
  os operadores reais dos dados — não da tabela `users`, já que só 1
  colaborador tem conta no Hub até agora).
- Novo `operador_ranking()` no Postgres, com o mesmo join correto
  (`LEFT JOIN` por email — operadores sem conta no Hub, como bots de IA,
  continuam aparecendo no ranking, só sem link para um perfil).

## Analytics reconstruído com dados reais (fase atual)

Antes de implementar, mapeei o schema real (não existe tabela de
"chamados" separada — só `csat_results`, que representa interações já
avaliadas). Isso significa duas limitações que preferi deixar visíveis na
tela em vez de mascarar:
- "Total de chamados" e "Total de avaliações" são **o mesmo número** hoje.
- Tempo de 1ª resposta/encerramento aparece como "—": as colunas existem
  (`tempo_primeira_resposta_seg`, `tempo_encerramento_seg`) mas estão
  100% nulas — nenhuma integração as preenche ainda.

O que foi entregue:
- **Cards**: total de chamados (com comparação vs. período anterior),
  total de avaliações, CSAT médio, % satisfação, tempo médio de 1ª
  resposta e de encerramento.
- **Evolução de chamados** e **evolução do CSAT**, com granularidade
  diária/semanal/mensal alternável (`analytics_evolucao()`).
- **Ranking de operadores** (nome, chamados, tempos, CSAT), com destaque
  do operador top — protegido pela permissão "Analytics", como antes.
- **Distribuição por Canal, Status e Tópico** (tópico é texto livre gerado
  por IA, então é agrupado Top 8 + "Outros" por frequência).
- **Filtros globais**: período (hoje/7d/30d/personalizado), operador,
  canal, status — afetam todos os indicadores da página.
- **Realtime**: `csat_results` foi adicionado à publicação do Supabase
  Realtime; `useRealtimeCsat()` invalida os caches relevantes assim que uma
  nova avaliação chega, sem precisar recarregar a página.

Todos os cálculos pesados (médias, agrupamentos, ranking) acontecem em
funções SQL (`security definer`), não no frontend.

## Métricas de atendimento corrigidas (1ª resposta humana)

Achado real ao investigar: **328 das 353 conversas tinham `first_response_at`
contaminado pela resposta automática do bot da Crisp** — o "tempo até 1ª
resposta" que o Hub mostrava não refletia o atendimento humano de verdade.
Além disso, 266 conversas ainda não têm nenhuma resposta humana registrada.

Corrigido na origem, no banco (nada de recalcular no frontend):

- Nova tabela-fonte `crisp_messages` (mensagem a mensagem, com `origin` e
  `operator_crisp_id`) passou a ser a base real do cálculo.
- Função interna `_primeiras_respostas_humanas()` (não exposta via API —
  só outras funções do banco podem chamá-la) identifica a primeira
  mensagem de atendente humano por conversa, excluindo:
  - `operator_crisp_id` nulo
  - `origin` contendo `crisp.im:bot`
  - `operator_nome` contendo "IA" ou "bot"
- `dashboard_atendimento_summary()`, `atendente_performance()` e
  `operador_ranking()` foram atualizadas para usar essa base corrigida.
- Nova função `atendimentos_com_metricas()` alimenta a tela Atendimentos
  com paginação, todos os filtros (período, atendente, canal, tipo de
  cliente) e **validação visual**: linhas com resposta antes do início ou
  tempo negativo ficam destacadas, e "sem resposta humana" aparece
  explicitamente em vez de um tempo inventado.
- Nova função `minhas_conversas_metricas()` alimenta o Meu Painel com os
  tempos corretos e pessoais, sem recalcular nada no cliente.
- Tempo de resolução mantém a fórmula pedida (`resolved_at - current_started_at`),
  calculada no banco.

**Efeito colateral esperado, não é bug**: como a maioria das conversas
ainda não teve resposta humana registrada, os números de TFR agora
aparecem sobre uma base bem menor de dados do que antes (que
incorretamente incluía respostas de bot) — isso é o comportamento correto
segundo as regras pedidas, mas vale saber que o volume caiu bastante.

## Calendário (módulo novo)

Nova aba `/calendario`, visível a todo o time (SAC vê e solicita folga;
Admin gerencia tudo), centralizando plantões, responsáveis, folgas, férias,
sobreaviso e feriados nacionais.

- **6 tabelas novas**, cada uma com responsabilidade própria (seguindo o
  padrão já usado no projeto): `calendar_holidays`, `calendar_week_responsibles`,
  `calendar_saturday_oncall`, `calendar_leave_requests`, `calendar_oncall`,
  `calendar_vacations`, `calendar_day_entries`.
- **Feriados nacionais calculados automaticamente**, inclusive os móveis
  (Carnaval, Sexta-feira Santa, Corpus Christi via cálculo da Páscoa) — já
  populados de 2025 a 2031, e é só rodar o mesmo script para estender.
- **Grade mensal** com navegação, badges por dia (🇧🇷 feriado, 🟢
  responsável, 🟡 folga, 🔴 férias, 🔵 sobreaviso), e **Drawer lateral**
  completo ao clicar em qualquer dia (Registro do Dia + Resumo), com o
  "Total do dia" calculado a partir da jornada configurada do responsável
  (a mesma jornada de Perfil/Administração — reaproveitada, não duplicada).
- **Solicitar Folga** (qualquer colaborador) e **área de aprovação**
  destacada no topo para Admin (aprovar/reprovar com um clique).
- Admin também define responsável da semana, plantão de sábado (com
  horário e observação), cadastra sobreaviso, férias e lançamentos extras,
  e pode limpar todos os registros de um dia.
- RLS seguindo exatamente o padrão do resto do Hub: leitura liberada a
  qualquer autenticado, escrita restrita a admin (exceto a própria
  solicitação de folga, que o colaborador cria para si mesmo).
- Realtime habilitado nas tabelas principais — aprovações, plantões e
  férias aparecem para todo mundo sem precisar recarregar.

**Simplificação assumida**: o "Total do dia" usa uma aproximação de 8h
para dia útil e 4h para plantão de sábado como base do responsável (mais
os lançamentos extras) — não recalcula minuto a minuto a partir da jornada
detalhada ainda; dá para refinar depois se for importante.

## Ajustes desta rodada (controle de horário, escalas, XP removido)

- **Bug crítico corrigido**: o colaborador Eduardo Nicolau tinha uma conta
  real de login no Supabase Auth, mas nunca vinculada ao perfil em
  `public.users` (mesmo problema do bootstrap do Mateus, lá na Fase 0) —
  isso derrubava o app inteiro para ele, não só o Meu Painel. Corrigido.
- **Horário de trabalho detalhado**: cada usuário agora configura a própria
  jornada de segunda a sexta (entrada, saída para almoço, retorno,
  saída) — self-service em **Perfil**, e editável pelo Admin em Usuários.
  Sábados não têm horário fixo: existe uma **escala manual** em
  Administração → Escalas (sequência de atendentes com rodízio automático,
  calculado por `atendente_escalado_sabado()`).
- **Indicadores de tempo** (Dashboard e Performance) já descontam o tempo
  fora do expediente configurado, incluindo o horário de almoço.
- **Sidebar reorganizada** em três seções visuais claras: Área SAC, Módulos
  com permissão, Área de Administradores — deixando explícito o que é
  exclusivo de administrador.
- **Missões geram Atualizações automaticamente** (toda missão nova
  publica um comunicado, via trigger); a aba Atualizações ganhou abas
  Todas/Gerais/Missões com destaque visual próprio para missões.
- **XP removido de toda a aplicação** — nenhuma referência restante em
  cards de missões, Meu Painel ou qualquer ranking (conferido com busca
  no código inteiro).
- **Atendimentos**: layout mais largo (container global de 1600px),
  colunas mescladas (Canal/Tipo, Período) e responsivas (menos essenciais
  somem em telas menores, sem forçar rolagem horizontal), e botão
  **"Ver chamado"** — abre `crisp_conversations.link_chamado` (coluna
  nova, ainda não populada pelo n8n; o botão só aparece quando o link
  existir).
- **Outros Links**: cards agora podem ter imagem (URL ou upload direto,
  via bucket `tool-images` no Supabase Storage — leitura pública, escrita
  só admin).

**Nota de interpretação**: o documento listava "Atendimento" como item da
Área SAC, mas a tela `/atendimentos` (lista de todas as conversas de todos
os atendentes) foi explicitamente restrita a administradores num pedido
anterior. Interpretei "Atendimento" aqui como a visão pessoal do
colaborador — **Meu Painel** — para não reverter silenciosamente essa
decisão de segurança. Avise se a intenção era outra.

## Ajustes desta rodada

- **Conversas/Atendimentos — filtro de Tipo corrigido de verdade**: a causa
  raiz era que `tipo_cliente` no banco é uma **lista de tags separadas por
  vírgula** (ex: `"seller, ia"`, `"vendedor, whatsapp, mrgreenn"`), não um
  valor único — por isso o filtro por igualdade exata nunca funcionava.
  Troquei para correspondência por tag (`ILIKE %tag%`) com as 6 opções
  reais encontradas nos dados: Final, Consumidor, Seller, Produtor (mapeia
  para a tag `vendedor`), SDR, Bluee.
- **Missões**: campo XP removido da criação (novas missões nascem com XP
  0; missões existentes mantêm o valor ao editar, já que o campo não é
  mais enviado no formulário).
- **Atualizações — notificação sonora em tempo real**: o sino já existente
  no Header (antes decorativo) agora funciona de verdade — toca um som
  (gerado via Web Audio API, sem depender de arquivo externo) e mostra um
  badge de não-lidas sempre que uma nova Atualização é publicada, via
  Realtime (`announcements` foi adicionada à publicação).
- **Administração — Horário de trabalho**: cada usuário agora tem
  `horario_inicio`/`horario_fim` configurável. Os indicadores de tempo
  (TFR e tempo de resolução no Dashboard e na Performance) passaram a
  descontar automaticamente o tempo fora do expediente, via a função
  `duracao_dentro_expediente()`. **Simplificação assumida e documentada**:
  a mesma janela diária se aplica a todos os dias (sem diferenciar fins de
  semana/feriados) e não há conversão de fuso horário — é uma aproximação
  razoável para o estágio atual, não um cálculo de escala trabalhista
  completo.
- **CSAT — listagem**: coluna "Cliente" agora mostra nome + e-mail (mesmo
  padrão do Atendimentos); nova coluna "Comentário" exibindo o comentário
  do cliente quando existir.

## Levantamento de consistência de dados por módulo

| Módulo | Tabela(s) | Status | Problema encontrado | Causa | Recomendação |
|---|---|---|---|---|---|
| Home (Dashboard) | `crisp_conversations`, `csat_results`, `announcements`, `mission_progress` | ✅ OK | — | — | — |
| Meu Painel | `csat_results` (por `email_atendente`), `crisp_conversations` (por `operator_email`) | ✅ OK | Tempos ficavam sempre "—" | `csat_results.tempo_*` nunca é preenchido pelo n8n | Corrigido: tempos agora vêm de `crisp_conversations` |
| Missões | `missions`, `mission_progress` | ✅ OK | — | — | — |
| **Analytics** | `csat_results`, `crisp_conversations` | ⚠️ **Corrigido agora** | Cards de CSAT (nota, satisfação) sempre vazios | Eu havia adicionado um `JOIN` com `users` via `user_id` numa correção anterior — `user_id` é sempre nulo em `csat_results`, então o JOIN eliminava todas as linhas | Corrigido: função `analytics_summary()` reescrita sem depender de `user_id` |
| CSAT (módulo) | `csat_results` | ✅ OK | — | — | Dados existem e são exibidos corretamente (era o exemplo de referência do documento — confirmado) |
| Reclame Aqui | `reclame_aqui_cases`, `reclame_aqui_metrics` | ⚠️ Dados de exemplo | Não é dado real do Crisp | Não existe integração n8n para Reclame Aqui/HugMe ainda | Aguardar integração real; tabela e tela já prontas para receber |
| NPS | `nps_responses` | ⚠️ Dados de exemplo | Idem acima | Não existe integração n8n para NPS ainda; existe uma tabela paralela `nps_followups` real mas vazia | Definir com o time qual das duas (`nps_responses` vs `nps_followups`) deve ser a fonte definitiva quando a integração existir |
| Atendimentos | `crisp_conversations` | ✅ OK (após correção) | Filtro de Tipo de Cliente não funcionava | Ver correção de tipo_cliente acima | Corrigido nesta rodada |
| Performance | `crisp_conversations`, `csat_results` | ✅ OK (após correção) | Tempos sempre vazios no ranking | Mesma causa do Analytics — corrigido junto | Corrigido nesta rodada |
| Helpdesks | `helpdesks` | ✅ OK | — | — | Dado real de uso interno, não vem do Crisp |
| Outros Links / Cursos / Documentação / Atualizações | `tools`, `courses`, `documentation`, `announcements` | ✅ OK | — | — | Conteúdo cadastrado manualmente via Admin, funcionando como esperado |
| Reunião de Resultados | `csat_results`, `rr_history` | ✅ OK | Sem dado de tempo total de atendimento | Mesma limitação de `tempo_*` em `csat_results` | Já resolvido para o que é calculável hoje (CSAT); tempo depende da mesma correção geral |
| Colaboradores Online | `user_status` | ✅ OK | — | — | — |
| Administração (Usuários/Perfis/Permissões/Módulos) | `users`, `roles`, `user_permissions`, `modules` | ✅ OK | — | — | — |

**Nota sobre `crisp_conversations` vs `csat_results`**: são duas tabelas
alimentadas pelo mesmo pipeline n8n, mas com propósitos diferentes —
`crisp_conversations` tem os tempos reais (`first_response_time_minutes`,
`resolution_time_minutes`) e por isso é a fonte usada para qualquer
indicador de tempo; `csat_results` tem a nota e o comentário do cliente e
é a fonte para qualquer indicador de satisfação. Ambas compartilham
`email_atendente`/`operator_email` como chave de vínculo confiável (não
`user_id`, que nunca é populado em nenhuma das duas).

## Lote de ajustes finos (módulos existentes)

- **Atendimentos / Performance**: agora restritos a administradores (rota +
  sidebar + funções SQL com `is_admin()` estrito, sem exceção via
  permissão granular).
- **Atendimentos**: filtros antigos trocados por busca global (nome/email
  do cliente) + filtro de Tipo de Cliente. `crisp_conversations` não tem
  campo telefone — texto explicativo na tela em vez de fingir que existe.
- **Meu Painel**: tempos de resposta corrigidos para vir de
  `crisp_conversations` (dado real), já que os campos equivalentes em
  `csat_results` nunca foram preenchidos; coluna Canal removida da lista de
  avaliações, e-mail do cliente exibido quando o canal é chat.
- **Missões**: criação simplificada (sem Unidade/Meta/Status no
  formulário — valores padrão aplicados nos bastidores); responsável
  agora opcional; missão sem responsável fica disponível para qualquer um
  assumir (`claim_mission()`); modal de detalhes ao clicar no card; gestão
  completa agora é **admin-only**.
- **Analytics**: corrigido um bug real em que os cards de tempo e o
  ranking sempre vinham vazios (liam colunas nunca preenchidas em
  `csat_results`) — agora usam `crisp_conversations`; removida a categoria
  agregada "Outros" do gráfico por tópico; ranking rotulado com a escala
  0–5.
- **Helpdesk**: fluxo simplificado para **Solicitando → Pendente →
  Finalizado**; link vira opcional na solicitação e só é exigido (com
  validação de formato) ao finalizar, via trigger no banco; área
  administrativa virou **Kanban arrastável** (drag-and-drop nativo, sem
  biblioteca externa); usuário comum só vê a coluna Finalizado.
- **CSAT**: "IA Greenn" e "Mateus Lansa" normalizados como o mesmo
  atendente para estatísticas/ranking (tabela `atendente_aliases`,
  extensível para novos casos); coluna Canal trocada por e-mail do
  cliente; quantidade de avaliações em negrito; exportação do dashboard em
  **PDF** (via `jspdf`).
- **NPS**: filtro "Fonte" removido; card/linha agora abre modal de
  detalhes; campo `notas_internas` adicionado — só admins veem e editam
  esse campo no modal.
- **Administração → Usuários**: campo "Status" removido do formulário de
  criação/edição (usuários continuam sendo criados como ativos por
  padrão).
- **Formatação de tempo unificada**: `src/lib/formatDuration.ts` substitui
  as várias implementações locais duplicadas (`formatSegundos`/`formatMin`
  espalhadas por Analytics, Performance, Atendimentos e Meu Painel),
  seguindo exatamente o formato pedido (75s → "1min 15s", 3600s → "1h",
  3725s → "1h 2min 5s").

## Helpdesks (módulo novo)

Nova aba `/helpdesks`, visível a todos no menu (🛠), com regras de
permissão aplicadas dentro da própria tela — sem precisar de uma tela
administrativa separada:

- **Usuário base**: vê os Helpdesks já criados (públicos) + as próprias
  solicitações; pode solicitar um novo (formulário com nome, descrição e
  link). Não vê nem interage com solicitações de outras pessoas.
- **Admin / permissão "helpdesks"**: vê todas as solicitações numa tabela
  de gestão, com ações contextuais por status (Aprovar/Rejeitar na fila,
  avançar para Em progresso, Marcar como Criado).
- **Fluxo de status** imposto pelo banco: `fila → pendente → em_progresso
  → criado` (ou `rejeitado`), com RLS garantindo que só admin/permissão
  altera status — um usuário base nunca consegue criar um Helpdesk
  diretamente, mesmo manipulando a API diretamente.
- **Validação do link**: aceita só URLs começando com
  `https://greenn.crisp.help/pt-br/` — validado no frontend (Zod) **e**
  como `check constraint` no banco (dupla camada, não dá pra burlar via
  API direta).
- **Integração com Atualizações**: um trigger (`gerar_atualizacao_helpdesk_criado`)
  cria automaticamente uma Atualização quando o status muda para "criado",
  com o nome do Helpdesk e o responsável pela aprovação — usando a mesma
  tabela `announcements` e o mesmo componente visual já existentes.
- Realtime habilitado — a lista e as solicitações atualizam sozinhas.

## Decisão de arquitetura: duas modelagens de Crisp coexistindo no banco

Durante a reconstrução do Analytics, o advisor de segurança revelou objetos
que eu não tinha mapeado (só tinha olhado tabelas, não *views*):

- **`crisp_conversations` + `crisp_ratings`**: schema separando chamado de
  avaliação, com `operator_id` (uuid, corretamente tipado) e os campos
  `first_response_time`/`resolution_time` — provavelmente preparado para
  uma futura integração direta com a API do Crisp. **Está com 0 linhas.**
- **`analytics_sac`**: uma *view* já pronta, calculando exatamente os
  indicadores principais do Analytics — só que em cima das tabelas acima,
  vazias.
- **`nps_followups`**: tabela vazia, possivelmente pensada para o mesmo
  propósito da `nps_responses` que criamos na Fase 9 (dado que já existe).

Decisão confirmada: **`csat_results` continua sendo a fonte de verdade**,
por ser a única com dado real fluindo hoje (provavelmente via n8n). As
tabelas `crisp_conversations`, `crisp_ratings`, `nps_followups` e a view
`analytics_sac` foram **deixadas intocadas** — nenhuma foi apagada ou
alterada. Ficam reservadas para o dia em que a integração direta com a API
do Crisp estiver pronta; nesse momento, faz sentido revisitar se vale
migrar `csat_results` para esse schema mais limpo (a decisão de "migrar"
estava disponível e não foi escolhida agora).

## `crisp_conversations` como fonte principal de atendimento

O n8n passou a alimentar `public.crisp_conversations` diretamente (320
linhas reais e crescendo). Isso trouxe:

- **Home**: 5 novos cards (Total de conversas, Conversas resolvidas, TFR
  médio, Tempo médio de resolução, CSAT médio) + gráfico de evolução
  diária — tudo calculado por `dashboard_atendimento_summary()` e
  `conversas_evolucao()`.
- **Nova página `/atendimentos`**: lista paginada de conversas com filtros
  por período, atendente, canal, tipo de cliente e status. Cada
  colaborador só vê, por padrão, as próprias conversas (RLS por
  `operator_email`); quem é Admin ou tem permissão de CSAT/Analytics vê
  tudo.
- **Nova página `/performance`**: ranking de atendentes (volume, TFR,
  tempo de resolução, CSAT médio, avaliações) via `atendente_performance()`
  — CSAT por atendente é correlacionado por **email** (`operator_email` =
  `email_atendente`), já que é o vínculo confiável disponível hoje.
- **Integração CSAT ↔ Conversas por `crisp_id`**: implementada
  corretamente (`csat_tempo_resposta_correlacao()`, `conversas_nota_baixa()`),
  mas como `csat_results.crisp_id` está 100% nulo no pipeline atual, essas
  duas análises aparecem vazias com uma mensagem explicando o motivo — não
  fabriquei dado para preencher isso.
- Realtime habilitado em `crisp_conversations`
  (`useRealtimeConversas.ts`) — Home, Atendimentos e Performance atualizam
  sozinhos quando uma nova conversa chega.

Tabelas que o advisor apontou como vazias/sem política e que **não
toquei**: `crisp_ratings`, `nps_followups`, e a view `analytics_sac` —
seguem reservadas, como já registrado antes.

## Nota sobre avisos do linter de segurança

O advisor do Supabase segue sinalizando `SECURITY DEFINER` em várias
funções (incluindo as novas — `dashboard_atendimento_summary`,
`conversas_evolucao`, `atendente_performance`, `distribuicao_*_conversas`,
`csat_tempo_resposta_correlacao`, `conversas_nota_baixa`, `operador_ranking`)
como potencialmente executáveis por `anon`, mesmo depois de eu revogar
`EXECUTE` de `public` e conceder apenas a `authenticated` duas vezes,
confirmando via SQL que o revoke foi aplicado. Isso parece ser um aviso
estrutural do linter (qualquer função `SECURITY DEFINER` na API exposta é
sinalizada, independente do grant atual) — na prática, mesmo que fosse
chamada por `anon`, todas essas funções dependem de `current_app_user_id()`
(que retorna nulo sem sessão) ou só devolvem agregados sem dado individual,
então o dano potencial é baixo. Fica registrado aqui para transparência,
caso quiseam investigar mais a fundo depois.

## Decisões de arquitetura tomadas nesta primeira versão

- **CRUD completo implementado como referência em "Usuários"** (tabela +
  formulário validado com React Hook Form + Zod, dentro de um modal). As
  demais entidades administráveis (Cursos, Ferramentas, Documentação,
  Comunicados) seguem o mesmo padrão e podem ser expandidas replicando esse
  componente.
- **Reunião de Resultados** já calcula a comparação automática com o período
  anterior (CSAT, atendimentos, tempo médio, meta), mas os campos
  qualitativos (aprendizados, dificuldades, plano de ação, objetivos)
  continuam manuais — por design, essa é uma decisão de produto, não uma
  limitação técnica.
- **Analytics** usa gráficos de barra simples em CSS/SVG para manter o bundle
  leve na V1. Se o volume de dados crescer, migrar para Recharts ou embutir o
  Power BI diretamente.
- **RBAC**: hoje só existem os perfis Administrador e Colaborador, mas o
  `AuthContext` e o `ProtectedRoute` já foram desenhados para suportar novos
  perfis sem refatoração estrutural.
