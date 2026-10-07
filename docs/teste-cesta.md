# Testes 1 e 2: Pague Menos legível? A comparação compensa?

**Data:** 2026-10-07 · **CEP:** 13340-503 · **Script:** `app/scripts/teste-cesta.ts` · **Dados brutos:** `docs/evidencias/teste-cesta.json`
Exploratório. Não é o produto, e **uma amostra pequena de um único dia não permite conclusão estatística**.

## Teste 1: o Pague Menos (supermercado) é legível por servidor?

**Sim para preço de vitrine; NÃO VERIFICADO para preço por CEP, entrega e frete.**

- A busca pública `/busca/<termo>` devolve HTML renderizado no servidor, com até 40 produtos por página. O robots.txt **não** proíbe `/busca/` (só `/api/`, `/carrinho/`, `/checkout/`, `/clientes/`, `/console/`). Nenhuma URL proibida foi acessada. Mesmo cliente educado do Covabra (UA identificável, robots.txt, 3 s entre requisições).
- A página de produto tem microdados schema.org (`itemprop="price"`, `availability`), mas **não tem JSON-LD, nem EAN**. Sem EAN, a equivalência com outros mercados depende do nome do produto.
- **Preço por CEP:** o HTML anônimo não mostra seletor de CEP/loja, e o rodapé diz que os preços são "exclusivos para compras online". Não sei se o preço varia por CEP. Descobrir isso exigiria endpoints que o robots.txt proíbe ou interação de navegador. **Não testado.**
- **Entrega/frete:** só dá para ver pelo carrinho/checkout, proibidos pelo robots.txt. Alguns itens aparecem como "Somente para retirada". **Não verificado.**
- Sem paginação (limite de 40 por busca) por cautela; em 5 das 20 buscas nenhum dos 40 resultados casou, e **não sei dizer se o item não existe no mercado ou se ficou fora dos 40**.
- **Divergência de preço dentro do próprio Pague Menos:** em 6 dos 14 pares, o preço visível na listagem difere do `data-json` embutido (ex.: visível R$ 22,99, data-json R$ 26,99). Usei o **visível**, que é o que o cliente vê. A causa (promoção? preço de clube? cache?) é **desconhecida**.

## Teste 2: cesta de 20 itens, Covabra × Pague Menos

Regra de equivalência (crua): nome contém marca, produto e tamanho; entre os candidatos, o mais barato. Ela **errou em vários pares**, como mostra a tabela. Por isso separei os pares realmente comparáveis (julgamento meu, lendo os nomes completos).

| Item | Covabra | Pague Menos | Comparável? |
|---|---|---|---|
| Feijão Camil carioca 1kg | 6,99 | 8,99 | sim |
| Leite Italac integral 1L | 5,99 | 5,29 | sim (PM com divergência de preço) |
| Macarrão Renata c/ ovos espaguete 500g | 3,99 | 4,99 | sim (PM com divergência) |
| Sal refinado Cisne 1kg | 3,99 | 3,69 | sim |
| Margarina Qualy com sal 500g | 7,99 | 10,29 | sim |
| Coca-Cola 2L | 10,99 | 12,49 | sim |
| Colgate Máxima Proteção 90g | 5,89 | 6,59 | sim |
| Sabonete Dove Original 90g | 5,79 | 4,89 | sim (PM com divergência) |
| Arroz Camil 5kg | 17,49 (Tipo I) | 22,99 (**Parbolizado**) | **não**: variantes diferentes |
| Farinha Dona Benta 1kg | 4,69 (Especial) | 5,79 (**Com fermento**) | **não** |
| Detergente Ypê 500ml | 2,69 (Clear) | 2,09 (Neutro) | **não**: variantes |
| Omo 1,6kg | 26,89 (Puro Cuidado) | 29,99 (Lavagem Perfeita) | **não**: variantes |
| Papel higiênico Neve 12 rolos | 34,69 (4 folhas) | 33,99 (folha tripla) | **não** |
| Banana prata | 2,08 (**1 unidade 180g**) | 1,99 (**500g**) | **não**: unidades diferentes |
| Açúcar União, Café Pilão | achado só no Covabra | — | sem par no PM |
| Óleo Liza 900ml | — | achado só no PM | sem par no Covabra |
| Molho Pomarola, Água sanitária Qboa, Biscoito Piraquê | — | — | nenhum dos dois |

**Resultado nos 8 pares comparáveis (n = 8; não é amostra estatística):**
- Total Covabra **R$ 51,62** × Pague Menos **R$ 57,22** → Covabra **R$ 5,60 (9,8 %) mais barato**.
- Covabra mais barato em 5 itens, Pague Menos em 3.
- **Dividir a cesta** (o mais barato de cada item): R$ 49,72, economia de **R$ 1,90 (3,7 %)** sobre comprar tudo no Covabra.

## O que isso significa (e o que não significa)

1. **Só 8 de 20 itens (40 %) deram comparação limpa.** O problema de equivalência é real: sem EAN no Pague Menos, nomes e variantes enganam até uma regra com marca e tamanho. O agente de equivalência e a revisão do usuário não são enfeite.
2. **Dividir a cesta entre os dois mercados não compensa nesta amostra.** R$ 1,90 é menor que qualquer taxa de entrega que vi citada (Covabra: R$ 11,90 a R$ 24,90, **notícia sem data, não verificada**; Pague Menos: **desconhecida**). A proposta "monte seu carrinho dividido" fica fraca.
3. **A proposta "qual mercado é mais barato para a minha cesta" tem algum sinal** (Covabra ~10 % abaixo), mas com n = 8, um dia, duas redes e uma cesta que escolhi, **não dá para generalizar**. Pão de Açúcar e Carrefour não entraram.
4. O Covabra devolveu um erro HTTP 500 em uma busca; o script repetiu uma vez e passou. O campo de estoque do Covabra (10000) continua sem significado conhecido.
5. A cesta e as marcas foram escolhidas por mim, e as buscas usam o nome comercial; resultados podem mudar com a cesta real do usuário.
