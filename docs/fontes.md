# Fontes de dados: viabilidade por mercado (Fase 0)

**Data da verificação:** 2026-10-07
**CEP de teste:** 13340-503 (Chácara do Trevo, Indaiatuba/SP; faixa 13340-500 a 13340-510, segundo [qualocep.com](https://www.qualocep.com/cep/sp/indaiatuba/vila-granada/). Confirmação nos Correios: **NÃO VERIFICADO**)

---

## ⚠️ Limitação desta verificação (leia primeiro)

O ambiente em nuvem onde esta fase rodou tem uma **política de rede que bloqueia todos os domínios dos mercados**. Testei e recebi bloqueio (`403 CONNECT` / `EGRESS_BLOCKED`) em:

`www.carrefour.com.br`, `mercado.carrefour.com.br`, `www.paodeacucar.com`, `www.paguemenos.com.br`, `www.superpaguemenos.com.br`, `www.covabra.com.br`, `www.mercadolivre.com.br`, `www.amazon.com.br`, `developers.vtex.com`

Consequências:

- **Não li nenhum robots.txt, termo de uso, página de produto, JSON-LD ou endpoint.** Tudo o que depende de acesso direto está marcado **NÃO VERIFICADO**.
- O que está abaixo vem de **fontes secundárias** (notícias do varejo e cases de fornecedores) achadas por busca web, e de **conhecimento prévio meu**, sempre rotulado como tal. Conhecimento prévio pode estar desatualizado. É hipótese, não fato.
- **Para fechar a Fase 0 de verdade**, alguém precisa (a) liberar esses domínios em *Network access* nas configurações do ambiente (Custom → Allowed domains), ou (b) rodar o script de verificação (Fase 1, passo 1) numa máquina local. Isso também é **pré-requisito da Fase 1**: sem acesso de rede aos mercados, o adapter não pode ser testado aqui.

Legenda: ✅ confirmado por fonte citada · 🟡 fonte secundária / indício · 🧠 conhecimento prévio meu, não verificado nesta sessão · ❌ NÃO VERIFICADO

---

## 1. Carrefour (Mercado Carrefour)

| Item | Status | Detalhe |
|---|---|---|
| (a) E-commerce que atende o CEP | 🟡 / ❌ | Há e-commerce de mercado com entrega e retirada em loja ([Mercado & Consumo, 2020](https://mercadoeconsumo.com.br/2020/10/09/carrefour-lanca-novo-e-commerce-com-busca-personalizada-e-gestao-integrada/)). Se entrega no 13340-503: **NÃO VERIFICADO**. |
| Plataforma | 🟡 | VTEX ([Baguete](https://www.baguete.com.br/noticias/carrefour-e-commerce-com-vtex)). Que o domínio de mercado (`mercado.carrefour.com.br`) ainda rode em VTEX em 2026: 🧠 provável, **NÃO VERIFICADO**. |
| (b) API / dados estruturados | 🧠 | Lojas VTEX costumam expor endpoints de storefront (o *Intelligent Search* em `/api/io/_v/api/intelligent-search/*`, legado; e o v1 em `/api/intelligent-search/v1/*`), com regionalização por `regionId`/canal de venda ([guia VTEX de migração para Intelligent Search v1](https://developers.vtex.com/docs/guides/migrating-to-intelligent-search-api-v1), visto só pelo snippet da busca). A regionalização por CEP costuma usar `GET /api/checkout/pub/regions?country=BRA&postalCode=...` 🧠. **Ponto importante:** esses endpoints são da *plataforma*. Não são uma API pública oferecida *pelo Carrefour* para terceiros. Se é "legítimo" usá-los depende dos termos de uso do site (❌). |
| (c) robots.txt / termos | ❌ | **NÃO VERIFICADO** (domínio bloqueado). |
| (d) Anti-bot | ❌ | **NÃO VERIFICADO**. 🧠 Grandes varejistas brasileiros costumam usar CDN/WAF (Akamai, Cloudflare etc.), que bloqueiam acesso de servidor. |
| Carrinho via extensão | 🧠 | Em VTEX, o carrinho é o `orderForm`. Dentro da sessão do próprio usuário, a extensão pode chamar `POST /api/checkout/pub/orderForm/{id}/items` e depois **ler o orderForm de volta para confirmar**. Isso é bem mais estável que clicar em botões do DOM. **NÃO VERIFICADO** neste site. |
| Desconto cartão/clube | 🧠 | Existe "Meu Carrefour" / cartão Carrefour. Como o preço com desconto aparece nos dados: **NÃO VERIFICADO**. |
| Afiliados | ❌ | **NÃO VERIFICADO**. |

## 2. Pão de Açúcar (GPA)

| Item | Status | Detalhe |
|---|---|---|
| (a) E-commerce que atende o CEP | 🟡 / ❌ | O GPA tem e-commerce forte (12,6% de penetração no 2T24, [CNN Brasil](https://www.cnnbrasil.com.br/agro/gpa-esta-no-caminho-para-ser-lider-no-digital-e-acoes-podem-subir-48-diz-safra/)). Há loja física em Indaiatuba, na Av. Presidente Vargas, 1.264, Cidade Nova (fonte secundária via busca; está aberta hoje? **NÃO VERIFICADO**). Entrega no CEP: **NÃO VERIFICADO**. |
| Plataforma | ❌ | Não achei fonte. 🧠 Acho que o GPA usa plataforma própria, não VTEX, mas **NÃO VERIFICADO**. Isso pesa: sem plataforma conhecida, o adapter é desenvolvido do zero. |
| (b) API / dados estruturados | ❌ | **NÃO VERIFICADO**. 🧠 O site é SPA e carrega dados por API JSON interna, que não é documentada para terceiros. |
| (c) robots.txt / termos | ❌ | **NÃO VERIFICADO**. |
| (d) Anti-bot | ❌ | **NÃO VERIFICADO**. |
| Desconto clube | 🧠 | "Pão de Açúcar Mais" / "Clube Mais" com preço diferenciado para cadastrados. Pode exigir login para ver o preço de clube, o que conflita com "pesquisa sem login". **NÃO VERIFICADO**. |
| Afiliados | ❌ | **NÃO VERIFICADO**. |

## 3. Pague Menos (Supermercados Pague Menos, interior de SP)

> ⚠️ **Cuidado com homônimo:** existe a **Farmácias Pague Menos** (rede nacional, VTEX, `paguemenos.com.br`). Vários resultados de busca, inclusive o [case da VTEX](https://vtex.com/en/blog/customer-stories/pague-menos-omnichannel/) e a citação de "1.100 lojas", são **da farmácia, não do supermercado**. O supermercado usa **`superpaguemenos.com.br`** ([ABC da Comunicação](https://www.abcdacomunicacao.com.br/tag/pague-menos/)).

| Item | Status | Detalhe |
|---|---|---|
| (a) E-commerce que atende o CEP | 🟡 | Tem e-commerce, com 90% das entregas em até 3h ([Mercado & Consumo, 2021](https://mercadoeconsumo.com.br/13/04/2021/noticias/90-das-entregas-do-e-commerce-da-pague-menos-sao-feitas-em-ate-3-horas/)), lockers Clique Retire ([2022](https://mercadoeconsumo.com.br/08/02/2022/destaque-do-dia/pague-menos-adota-rede-de-lockers-da-clique-retire/)) e venda por WhatsApp ([2025](https://mercadoeconsumo.com.br/03/04/2025/noticias-varejo/pague-menos-aumenta-vendas-com-pagamentos-automatizados-pelo-whatsapp/)). Está em Indaiatuba desde 2008, com 2ª loja na Av. Manoel Ruz Peres ([SuperVarejo](https://supervarejo.com.br/varejo/supermercados-pague-menos-inaugura-segunda-loja-em-indaiatuba-sp)). **Atender o 13340-503 é provável pela presença local, mas NÃO VERIFICADO.** |
| Plataforma | ❌ | **NÃO VERIFICADO** (não confundir com a VTEX da farmácia). |
| (b) API / dados estruturados | ❌ | **NÃO VERIFICADO**. |
| (c) robots.txt / termos | ❌ | **NÃO VERIFICADO**. |
| (d) Anti-bot | ❌ | **NÃO VERIFICADO**. 🧠 Rede regional tende a ter menos proteção que as nacionais. É suposição. |
| Afiliados | ❌ | **NÃO VERIFICADO**. |

## 4. Covabra

| Item | Status | Detalhe |
|---|---|---|
| (a) E-commerce que atende o CEP | 🟡 | Tem e-commerce ("Covabra Entrega"), com 75 mil usuários/mês e 27 cidades atendidas, taxa de R$ 11,90 a R$ 24,90 e **frete grátis acima de R$ 100** ([SuperVarejo](https://supervarejo.com.br/varejo/covabra-supermercados-lanca-novo-site-com-mais-funcionalidades); data da matéria e valores atuais: **NÃO VERIFICADOS**). Inaugurou loja em Indaiatuba em mar/2025 ([Mercado & Consumo](https://mercadoeconsumo.com.br/26/03/2025/noticias-varejo/covabra-supermercados-amplia-sua-presenca-no-interior-paulista-com-inauguracao-em-indaiatuba/)). Atender o CEP: provável, **NÃO VERIFICADO**. |
| Plataforma | ❌ | **NÃO VERIFICADO**. |
| (b) API / dados estruturados | ❌ | **NÃO VERIFICADO**. |
| (c) robots.txt / termos | ❌ | **NÃO VERIFICADO**. |
| (d) Anti-bot | ❌ | **NÃO VERIFICADO**. |
| Afiliados | ❌ | **NÃO VERIFICADO**. |

## 5. Mercado Livre (Fase 3b)

| Item | Status | Detalhe |
|---|---|---|
| API | 🧠 | Existe API oficial para desenvolvedores (developers.mercadolivre.com.br), com busca de itens. Ao longo dos anos ela passou a exigir token OAuth para endpoints que antes eram abertos. Estado atual: **NÃO VERIFICADO**. |
| Supermercado | 🧠 | O preço **varia por vendedor** e o frete depende do CEP. Exige modelar "oferta" separada de "produto". |
| robots/termos/anti-bot | ❌ | **NÃO VERIFICADO**. |
| Carrinho | 🧠 | Carrinho por API para terceiros: acho que não existe. Teria de ser via extensão. **NÃO VERIFICADO**. |
| Afiliados | 🧠 | Existe programa de afiliados do ML. Condições: **NÃO VERIFICADO**. |

## 6. Amazon.com.br (Fase 3b)

| Item | Status | Detalhe |
|---|---|---|
| API | 🧠 | A Product Advertising API exige conta no Amazon Associados **com vendas qualificadas** para manter o acesso. A Amazon anunciou migração para uma "Creators API" em 2025–2026 (**NÃO VERIFICADO**). Scraping da Amazon é notoriamente bloqueado e proibido pelos termos 🧠. |
| robots/termos/anti-bot | ❌ | **NÃO VERIFICADO**. |
| Afiliados | 🧠 | Amazon Associados existe no Brasil. Condições: **NÃO VERIFICADO**. |

---

## Ranking de viabilidade (provisório)

> **Este ranking é uma hipótese de trabalho, não uma conclusão.** Ele se baseia em fontes secundárias e conhecimento prévio, porque nenhum site pôde ser acessado. Ele **deve ser refeito** quando o script de verificação (Fase 1, passo 1) rodar com acesso de rede. Se o resultado contradisser o ranking, o ranking muda e eu aviso.

### Busca de preços (sem login, por CEP)

| # | Mercado | Por quê | Confiança |
|---|---|---|---|
| 1 | **Carrefour** | Plataforma conhecida (VTEX, com fonte), endpoints de busca e regionalização documentados pela plataforma. Maior risco: WAF/anti-bot no servidor. | Média-baixa |
| 2 | **Covabra** | Tem loja em Indaiatuba e e-commerce ativo, e a regra de frete foi publicada. Plataforma desconhecida. | Baixa |
| 3 | **Pague Menos (super)** | Forte em Indaiatuba e e-commerce ativo. Plataforma desconhecida. | Baixa |
| 4 | **Pão de Açúcar** | Plataforma provavelmente própria. O preço de clube pode exigir login. | Baixa |
| — | Mercado Livre | Tem API oficial, mas o preço por vendedor complica. Fica na Fase 3b. | Baixa |
| — | Amazon | Barreira de acesso à API e scraping proibido. Fica na Fase 3b; pode ser inviável. | Baixa |

### Preenchimento de carrinho via extensão (sessão logada do usuário)

| # | Mercado | Por quê |
|---|---|---|
| 1 | **Carrefour** | Se for VTEX, a extensão usa a API de `orderForm` na própria sessão e **confirma lendo o carrinho de volta**, sem depender do DOM para a confirmação. |
| 2 | **A definir entre Covabra e Pague Menos** | Depende da plataforma (❌). Se uma delas também for VTEX, vira a nº 2 com folga. |
| 3 | Pão de Açúcar | Plataforma própria, com integração provavelmente via DOM ou API interna não documentada. Mais frágil. |

**Risco para a Fase 3a:** só existe evidência (secundária) de plataforma "amigável a extensão" para **1 mercado** (Carrefour). Se a verificação real mostrar que nenhum dos outros três é viável, a regra do prompt se aplica: **paro e aviso, sem fingir que o segundo funciona.**

---

## Pesquisa que embasa decisões de produto

- **Preço unitário (R$/kg, R$/L):** estudo de campo clássico em supermercados mostrou que exibir o preço unitário numa lista organizada fez os consumidores migrarem para opções mais baratas por unidade (Russo, Krieser & Miyashita, 1975, *"An Effective Display of Unit Price Information"*, Journal of Marketing 39(2)). Sustenta a exibição de preço normalizado em toda comparação.
- **Divisão de carrinho entre mercados:** é uma variante do *Traveling Purchaser Problem* / *shopping plan problem*, NP-difícil no caso geral (Ramesh, 1981; Laporte, Riera-Ledesma & Salazar-González, 2003). Com **4 a 6 mercados**, dá para enumerar todos os subconjuntos (2⁶−1 = 63) e resolver exatamente. O pedido mínimo por mercado exige um pequeno solver (ILP ou busca exaustiva com poda), não um guloso simples. Detalhes no plano.
- **Trechos de fontes que não consegui abrir** (como o guia da VTEX, bloqueado) foram usados só pelo resumo da busca, e estão marcados assim.
