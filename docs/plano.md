# Plano por fases: Comparador de Compras de Supermercado

**Status:** Fase 0 concluída com ressalvas. Decisões 1–3 aprovadas em 2026-10-07 (app em `/app` neste repo; rede liberada; modelo de dados aprovado). Decisão 4 (chaves Anthropic/Supabase) pendente, só necessária após a verificação de fontes.
**Data:** 2026-10-07

---

## 0. Decisões que preciso de você antes da Fase 1

1. **Repositório.** O branch atual é do repo `replyai-landing`, que hoje contém só um `index.html` de landing page. Misturar o app aqui deixa o histórico confuso. **Recomendo um repo novo** (ex.: `comparador-mercado`). Se preferir manter aqui, crio tudo em `/app` sem tocar no `index.html`.
2. **Acesso de rede aos mercados.** Este ambiente bloqueia os domínios dos mercados (ver `fontes.md`). Opções: (a) liberar os domínios em *Network access* (Custom → Allowed domains) nas configurações do ambiente; ou (b) eu escrevo o código e os testes com fixtures e você roda a verificação real localmente. **Sem (a) ou (b), nenhum dado real é possível, e a Fase 1 entregaria só MOCK.**
3. **Aprovação do modelo de dados** (seção 4).
4. **Chaves:** `ANTHROPIC_API_KEY` e um projeto Supabase (URL + anon key + service role key) nos segredos do ambiente. Nunca no código.

---

## 1. Arquitetura

```
┌───────────── Next.js (App Router, Vercel ou Node) ─────────────┐
│  UI pt-BR: lista · CEP/prefs · resultado · detalhe · status    │
│  Route handlers: criam search_job, leem resultados (Realtime)  │
└───────────────┬────────────────────────────────────────────────┘
                │ insere job                ▲ Supabase Realtime
                ▼                           │ (status das buscas)
┌──────────── Supabase (Postgres + Auth + RLS) ──────────────────┐
│  tabelas (seção 4) · fila = tabela search_jobs + SKIP LOCKED   │
└───────────────┬────────────────────────────────────────────────┘
                │ worker pega job
                ▼
┌──────────── Worker Node (processo separado, container) ────────┐
│  Claude Agent SDK: orquestrador + subagentes                    │
│  Ferramentas MCP in-process (createSdkMcpServer + tool()):      │
│   - search_market(market, cep, query)  → PriceSource adapters   │
│   - normalize_size(text) (determinístico, com fallback LLM)     │
│   - optimize(plan_input)               → otimizador puro TS     │
│  Adapters: api → (extensão) → scraping Playwright (flag)        │
└─────────────────────────────────────────────────────────────────┘

Extensão Chrome MV3: núcleo comum + adapters por mercado,
recebe cart_plan do app, adiciona itens e confirma lendo o carrinho.
```

**Por que um worker separado:** a documentação oficial do Agent SDK diz que `query()` **cria um subprocesso `claude` CLI** com estado em disco, e recomenda container, não função serverless ([Hosting the Agent SDK](https://code.claude.com/docs/en/agent-sdk/hosting)). O Playwright também precisa de processo persistente. O Next.js só enfileira e lê o resultado.

**Fila:** tabela `search_jobs` no Postgres com `SELECT ... FOR UPDATE SKIP LOCKED`. É suficiente para protótipo e dispensa Redis. BullMQ fica como alternativa se faltar desempenho.

### APIs do Agent SDK que vou usar (conferidas na doc oficial TS em 2026-10-07)

Pacote `@anthropic-ai/claude-agent-sdk`:

- `query({ prompt, options })`, que retorna um `AsyncGenerator<SDKMessage>`.
- `options.agents: Record<string, AgentDefinition>`, onde `AgentDefinition` tem `description`, `prompt`, `tools`, `model`, `maxTurns` e `mcpServers`. É assim que defino os subagentes.
- `createSdkMcpServer({ name, tools })` + `tool(name, description, zodShape, handler)` para as ferramentas determinísticas in-process.
- `options.outputFormat: { type: 'json_schema', schema }` para saída estruturada (parser, equivalência). A saída é validada de novo com Zod no meu lado.
- `options.allowedTools`, `options.tools` (para restringir: **sem** Bash, Edit ou WebFetch genérico), `options.permissionMode`, `options.maxTurns`, `options.maxBudgetUsd`, `options.settingSources: []` (isolamento).
- `SDKResultMessage.usage` e `total_cost_usd`, gravados em `search_jobs` para o **custo por busca**.

Se algo disso mudar na versão instalada, ajusto pelo `.d.ts` do pacote, não de memória.

### Onde fica LLM e onde fica código

| Tarefa | Implementação |
|---|---|
| Parser de lista (texto → itens) | LLM com `outputFormat` JSON Schema + validação Zod |
| Busca por mercado | **Código** (adapter). O LLM só reformula a busca se vier zero resultados. |
| Extração de tamanho (5kg, 12x350ml, "pack c/6") | **Regex determinística primeiro**. LLM só se a regex falhar, com flag `fonte_extracao=llm` e confiança reduzida. Se nenhum dos dois extrair → `sem_tamanho`, sem chute. |
| R$/kg, R$/L, R$/un | **Código** |
| Equivalência entre mercados | LLM → `{canonico, score 0–1, justificativa}`. Abaixo do limiar (0,8, configurável) → status `revisar`, com confirmação na UI. |
| Custo total e combinação ótima | **Código** (puro, testado) |
| Explicação do resultado | LLM, recebendo só o JSON do otimizador, sem poder alterar números |
| Substituição | LLM sugere, código recalcula o custo |

### Otimizador (determinístico)

- Entrada: itens × ofertas por mercado, frete por mercado e modo (entrega/retirada), pedido mínimo, limiar de frete grátis, descontos de cartão/clube **separados** e preferências (marca + sobrepreço máximo X% por item).
- Algoritmo: enumera todos os subconjuntos de mercados (≤ 2⁶−1 = 63). Para cada um, atribui cada item ao mercado mais barato do subconjunto e verifica o pedido mínimo. Se violar, faz busca exaustiva com poda sobre realocações (n de itens pequeno) ou ILP simples. Resultado exato, não heurístico, dentro do escopo do MVP. Base teórica: variante do *Traveling Purchaser Problem* (ver `fontes.md`).
- Modos: (1) menor total com entrega; (2) menor total com retirada; (3) conveniência = minimizar nº de mercados e desempatar por custo; (4) marca preferida com teto de sobrepreço.
- Saída extra: custo marginal de cada divisão, e "faltam R$ X para frete grátis; itens sugeridos com preço abaixo do frete economizado".
- Testes (Vitest): 5kg vs 500g, 12x350ml, pack, frete grátis acima de X, pedido mínimo não atingido, item indisponível em todos, empate.

### Transparência de dados

Todo `price_snapshot` tem mercado, CEP, loja/CD, timestamp, URL, fonte (`api|extensao|scraping|mock`) e confiança. A UI mostra **"desatualizado"** para mais de 24h, **"MOCK"** em destaque e **"indisponível"** para mercado bloqueado. Divergências (ex.: preço do JSON-LD ≠ preço da página, unidade inconsistente) viram linha em `source_logs` e aparecem na UI.

### Scraping (fallback, atrás de `ENABLE_SERVER_SCRAPING=false` por padrão)

Rate limit de 1 req/3s por domínio, cache de 6h, User-Agent identificável com contato, checagem de robots.txt antes de cada domínio (bloqueia se `Disallow`), e cada 403/429/captcha registrado em `source_logs` → mercado marcado "indisponível". **Sem** burla de captcha, rotação de proxy ou spoofing.

---

## 2. Fases

### Fase 1: esqueleto + 1 mercado ponta a ponta

1. **Script de verificação** `scripts/verificar-fontes.ts`: baixa robots.txt e termos (se houver link), detecta plataforma (headers/HTML VTEX etc.), testa busca por CEP e procura JSON-LD. Gera `docs/fontes-verificacao.json` e **atualiza `fontes.md` e o ranking**. *Precisa de rede (decisão 2).*
2. Next.js + Supabase + migrations + RLS + Auth (e-mail magic link).
3. Parser de lista (Agent SDK, saída estruturada) + testes com 20 listas de exemplo.
4. Interface `PriceSource` + adapter do mercado nº 1 do ranking **verificado** (hipótese atual: Carrefour).
5. Worker + fila + status em tempo real.
6. Telas: lista, CEP/preferências, status, resultado com 1 mercado.
7. Registro de custo em tokens por busca.

**Critério de saída:** uma lista real gera preços reais de 1 mercado para o CEP 13340-503, com fonte/hora/confiança visíveis. Se o mercado bloquear, o resultado é registrado e eu reporto. Não troco por mock em silêncio.

### Fase 2: demais supermercados + equivalência + normalização + otimizador + UI

Adapters 2–4, agente de equivalência com fila de "revisar", normalizador, otimizador com testes, tela comparativa (tabela + resumo + detalhe por item), preço clube/cartão separado. **Meta:** 20 itens em ≤ 2 min com ≥ 2 mercados reais.

### Fase 3a: extensão de carrinho (MV3)

Núcleo comum (recebe `cart_plan` via página do app + `externally_connectable`, executa, reporta) + adapters isolados por mercado. Estratégia preferida: API de carrinho da plataforma **dentro da sessão do usuário** (ex.: `orderForm` VTEX), com **confirmação lendo o carrinho de volta**. DOM só como último recurso. Relatório item a item: `adicionado | falhou | substituto`. Nunca marca sucesso sem confirmar. **Se só 1 mercado for viável → paro e aviso.**

### Fase 3a, experimento: extensão determinística vs. agente navegante

Mesma lista de 10 itens, nos 2 mercados da extensão, nas duas abordagens:
- **A (principal):** adapters determinísticos + leitura do carrinho de volta.
- **B (plano B):** agente que navega o site numa aba por mercado, na sessão logada do usuário. Checkout e pagamento bloqueados por regra em código, não por instrução ao agente.

Métricas por abordagem: itens corretos / itens com variante errada / falhas, tempo total, tokens e custo, e bloqueios anti-bot. Resultado entra em `relatorio.md` com os números medidos. **Pré-requisito:** um computador do usuário com Chrome e Claude in Chrome; a sessão cloud não controla o navegador dele. Se não houver computador disponível, o experimento fica registrado como "NÃO EXECUTADO".

No produto, B só entra como fallback por item, marcado na UI como "feito pelo agente, confira".

**Risco de plataforma:** pelo que sei, o Chrome para Android não roda extensões (NÃO VERIFICADO). Se confirmado, a extensão só atende usuários de computador; o fallback "lista por mercado com links diretos" é o caminho para celular.

### Fase 3b: Mercado Livre e Amazon

Só se viáveis pela API oficial. Modelo de oferta por vendedor. Pode terminar em "inviável" documentado.

### Fase 4: histórico, alertas, voz/foto, hooks de monetização

Série temporal de `price_snapshots`, alerta de queda, entrada por voz/foto, `affiliate_links` isolados e marcados, `plan_tier` sem pagamento.

Documentos finais: `docs/riscos.md` (termos por site, LGPD, necessidade de revisão jurídica) e `docs/relatorio.md`. O rascunho de `riscos.md` sai na Fase 1.

---

## 3. Riscos conhecidos desde já

- **Achado de 2026-10-07:** o Carrefour responde 403 com desafio Cloudflare (`cf-mitigated: challenge`) a acesso de servidor; fica fora da busca por servidor. Os robots.txt de Pão de Açúcar (`/busca`), Pague Menos (`/api/`) e Covabra (`/busca/*`, `*?_q=`) proíbem as URLs de busca/API. Com robots.txt respeitado por padrão, a leitura de preços tende a depender da extensão.
- **Bloqueio anti-bot no servidor** é o risco nº 1 para "≥ 2 mercados reais". A mitigação legítima é ler os preços pela extensão, na sessão do usuário, o que muda o fluxo: o usuário precisa ter a extensão instalada para obter os dados.
- **Termos de uso** podem proibir acesso automatizado. Se proibirem, o adapter de scraping daquele mercado fica desligado, e eu digo isso.
- **Preço de clube atrás de login** (Pão de Açúcar, possivelmente outros). Na pesquisa sem login, esse preço fica "não disponível sem login", não estimado.
- **Fragilidade da extensão:** mudança de DOM ou API interna quebra o adapter. Mitigação: adapters isolados, testes de fumaça e relatório de falha item a item.
- **LGPD:** CEP + lista de compras podem revelar dados sensíveis (saúde, religião, via alimentos). Minimização, RLS e retenção definida.

---

## 4. Modelo de dados proposto (para aprovação)

```sql
-- usuários: auth.users do Supabase + perfil
profiles(id uuid pk → auth.users, created_at, plan_tier text default 'free')   -- hook premium

shopping_lists(id, user_id → profiles, name, raw_text, cep char(8), created_at)
list_items(id, list_id, position, raw_text, product_name, quantity numeric, unit text,
           preferred_brand text null, max_brand_premium_pct numeric null,
           restrictions text[], parse_confidence numeric, status text)  -- ok|revisar

preferences(user_id pk, default_cep, mode text  -- entrega|retirada|conveniencia|marca
            , max_markets int, card_programs text[])  -- quais cartões/clubes o usuário tem

markets(id, slug, name, base_url, platform text null, enabled bool,
        availability text,  -- disponivel|indisponivel|nao_verificado
        robots_checked_at, notes)
stores(id, market_id, external_id, name, city, cep, kind text)  -- loja|cd|dark_store
market_coverage(market_id, cep_prefix, store_id, checked_at, serves bool)

products(id, market_id, external_id, ean text null, name, brand, size_value numeric null,
         size_unit text null,  -- g|ml|un
         pack_count int default 1, size_source text,  -- regex|llm|ausente
         url, image_url)
canonical_products(id, name, category, base_unit text)   -- kg|L|un
product_matches(id, canonical_id, product_id, list_item_id null, score numeric,
                justification text, status text,  -- auto|revisar|confirmado|rejeitado
                decided_by text, created_at)

price_snapshots(id, product_id, market_id, store_id, cep, price numeric,
                club_price numeric null, club_condition text null,
                unit_price numeric null, unit_basis text null,  -- R$/kg|R$/L|R$/un
                available bool, source text,  -- api|extensao|scraping|mock
                confidence numeric, url, captured_at timestamptz)   -- série temporal

delivery_options(id, market_id, store_id, cep, mode text, fee numeric,
                 min_order numeric null, free_above numeric null,
                 window text, source, captured_at)

search_jobs(id, list_id, user_id, cep, mode, status text,  -- pendente|rodando|ok|parcial|falhou
            per_market_status jsonb, started_at, finished_at,
            input_tokens int, output_tokens int, cost_usd numeric, error text)

cart_plans(id, job_id, user_id, market_id, items jsonb, totals jsonb, created_at)
cart_fill_reports(id, cart_plan_id, item_ref, result text,  -- adicionado|falhou|substituto
                  detail text, confirmed_in_cart bool, created_at)

source_logs(id, market_id, job_id null, kind text,  -- bloqueio|captcha|robots_disallow|divergencia|erro
            http_status int null, url, detail, created_at)

affiliate_links(id, market_id, product_id null, url, program text, verified bool default false)  -- fase 4, isolado
price_alerts(id, user_id, canonical_id, target_price, active)  -- fase 4
```

RLS: tudo que tem `user_id` é visível só ao dono. `markets`, `stores`, `products` e `price_snapshots` são leitura pública e escrita só via service role (worker).

**Não existe nenhuma coluna para senha ou dados de cartão de mercado**, por desenho.

---

## 5. O que esta Fase 0 NÃO conseguiu fazer (honestidade)

- Não acessei nenhum site de mercado, nem a doc da VTEX (bloqueio de rede do ambiente). `fontes.md` está majoritariamente **NÃO VERIFICADO**, e o ranking é hipótese.
- Não confirmei se algum dos 4 mercados entrega no CEP 13340-503.
- Não verifiquei programas de afiliados.
- A conferência do Agent SDK foi feita na doc oficial (`code.claude.com/docs/en/agent-sdk/typescript` e `/hosting`), lendo cerca de 1/3 da página de referência TS. O restante confiro no `.d.ts` ao instalar.
