# Riscos e conformidade (RASCUNHO, Fase 1)

> **Este produto precisa de revisão jurídica antes de qualquer lançamento comercial.** Este arquivo é um rascunho técnico, não parecer jurídico.

## Termos de uso por site (situação em 2026-10-07)

| Mercado | Termos de uso | robots.txt | Estado do acesso automatizado |
|---|---|---|---|
| Covabra | **Nenhuma página de "Termos de uso" encontrada** (só políticas de reembolso, frete, conduta, bem-estar e 2 PDFs de LGPD, não lidos). Ausência de cláusula **não** equivale a permissão. | Proíbe `/busca/*`, `*?_q=`, `*?page=`, `/checkout/*`, `/account/*`. Não proíbe `/api/`. | Adapter implementado, **desligado por padrão** (`ENABLE_COVABRA_API`). Usa API de vitrine do próprio site, pública e sem login, mas **não oferecida a terceiros**. |
| Pague Menos (super) | NÃO VERIFICADO | Proíbe `/api/`, `/carrinho/`, `/checkout/`, `/clientes/`, `/console/` | Sem adapter. |
| Pão de Açúcar | NÃO VERIFICADO | Proíbe `/busca`, `/checkout`, `/user/` etc.; o site devolve 403 ao nosso User-Agent identificável | Sem adapter. Não contornado. |
| Carrefour | NÃO VERIFICADO | 403 com desafio Cloudflare | Sem adapter. Não contornado. |

## Medidas técnicas já implementadas (Covabra)
User-Agent identificável com contato; robots.txt checado antes de cada requisição (falha fechada); 1 requisição a cada 3 s por host; cache de 6 h; todo bloqueio, desafio e divergência é registrado; nada de burla de captcha, proxy rotativo ou spoofing.

## LGPD (a detalhar)
CEP e lista de compras são dados pessoais e podem revelar hábitos sensíveis (saúde, religião). Pendente: base legal, minimização, retenção, direitos do titular, operadores (Supabase, Anthropic).

## Pendências
Ler termos de todos os mercados; avaliar com advogado o uso de APIs de vitrine; afiliados: NÃO VERIFICADO em todos os mercados.
