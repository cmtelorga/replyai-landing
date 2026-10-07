/**
 * Teste 2: cesta de 20 itens, Covabra x Pague Menos. EXPLORATÓRIO, não é o produto.
 * Regra de equivalência (crua, exibida no relatório para conferência humana):
 *   o nome do produto precisa conter TODOS os grupos de termos (cada grupo = alternativas) e NENHUM termo proibido.
 *   Se houver vários, usa-se o MAIS BARATO entre os equivalentes, em ambos os mercados.
 * Uso: ENABLE_COVABRA_API=true npx tsx scripts/teste-cesta.ts
 */
import { writeFile } from "node:fs/promises";
import { CovabraSource, InMemoryLogger, PoliteClient } from "../src/sources/index.js";
import { curlTransport } from "./curl-transport.js";

interface Item { label: string; query: string; all: string[][]; none?: string[] }
const CESTA: Item[] = [
  { label: "Arroz Camil tipo 1 5kg", query: "arroz camil 5kg", all: [["arroz"], ["camil"], ["5kg"]] },
  { label: "Feijão carioca Camil 1kg", query: "feijao carioca camil 1kg", all: [["feijao"], ["carioca"], ["camil"], ["1kg"]] },
  { label: "Açúcar refinado União 1kg", query: "acucar uniao 1kg", all: [["acucar"], ["uniao"], ["1kg"]] },
  { label: "Óleo de soja Liza 900ml", query: "oleo de soja liza 900ml", all: [["oleo"], ["soja"], ["liza"], ["900ml"]] },
  { label: "Café Pilão tradicional 500g", query: "cafe pilao 500g", all: [["cafe"], ["pilao"], ["500g"]] },
  { label: "Leite integral UHT Italac 1L", query: "leite integral italac 1l", all: [["leite"], ["integral"], ["italac"], ["1l"]] },
  { label: "Macarrão espaguete Renata 500g", query: "macarrao espaguete renata 500g", all: [["macarrao"], ["espaguete"], ["renata"], ["500g"]] },
  { label: "Farinha de trigo Dona Benta 1kg", query: "farinha de trigo dona benta 1kg", all: [["farinha"], ["trigo"], ["dona benta"], ["1kg"]] },
  { label: "Sal refinado Cisne 1kg", query: "sal cisne 1kg", all: [["sal"], ["cisne"], ["1kg"]] },
  { label: "Molho de tomate Pomarola 340g", query: "molho de tomate pomarola 340g", all: [["molho"], ["tomate"], ["pomarola"], ["340g"]] },
  { label: "Margarina Qualy 500g", query: "margarina qualy 500g", all: [["margarina"], ["qualy"], ["500g"]] },
  { label: "Coca-Cola original 2L", query: "coca cola 2l", all: [["coca"], ["2l"]], none: ["zero", "light", "diet", "lemon", "cafe", "vanila"] },
  { label: "Detergente Ypê 500ml", query: "detergente ype 500ml", all: [["detergente"], ["ype"], ["500ml"]] },
  { label: "Sabão em pó Omo 1,6kg", query: "sabao em po omo 1,6kg", all: [["omo"], ["1,6kg", "1.6kg", "1600g"]] },
  { label: "Papel higiênico Neve 12 rolos", query: "papel higienico neve 12 rolos", all: [["neve"], ["papel higienico"], ["12 rolos", "c/12", "12un", "12 un", "l12", "12 unidades"]] },
  { label: "Creme dental Colgate 90g", query: "creme dental colgate 90g", all: [["colgate"], ["creme dental"], ["90g"]] },
  { label: "Sabonete Dove 90g", query: "sabonete dove 90g", all: [["dove"], ["sabonete"], ["90g"]] },
  { label: "Água sanitária Qboa 1L", query: "agua sanitaria qboa 1l", all: [["sanitaria"], ["qboa", "q-boa"], ["1l"]] },
  { label: "Banana prata (kg)", query: "banana prata", all: [["banana"], ["prata"]], none: ["chips", "doce", "bala"] },
  { label: "Biscoito Maizena Piraquê 200g", query: "biscoito maizena piraque 200g", all: [["maizena"], ["piraque"], ["200g"]] },
];

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/(\d)\s+(kg|g|ml|l|un)\b/g, "$1$2").replace(/\s+/g, " ").trim();
const matches = (name: string, it: Item) => {
  const n = norm(name);
  return it.all.every((alts) => alts.some((a) => n.includes(a))) && !(it.none ?? []).some((x) => n.includes(x));
};
const brl = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));

interface Hit { name: string; price: number; url: string; flags: string[] }

const logger = new InMemoryLogger();
const cov = new CovabraSource({ http: new PoliteClient({ market: "covabra", transport: curlTransport, logger }), logger });
const pmHttp = new PoliteClient({ market: "paguemenos", transport: curlTransport, logger });

async function pagueMenos(q: string): Promise<Hit[]> {
  const res = await pmHttp.get(`https://www.superpaguemenos.com.br/busca/${encodeURIComponent(q)}`);
  const hits: Hit[] = [];
  for (const blk of res.body.split(/<div\s+class="item-product"/).slice(1)) {
    const href = blk.match(/<a href="(\/[^"]+\/p)"/)?.[1];
    const name = blk.match(/<h2 class="title"><a [^>]*>([\s\S]*?)<\/a>/)?.[1]?.replace(/\s+/g, " ").trim();
    const sale = blk.match(/class="sale-price"[^>]*>[\s\S]*?<strong>\s*(R\$[^<]+)</)?.[1];
    if (!href || !name || !sale) continue;
    const text = blk.replace(/<[^>]+>/g, " ");
    const flags: string[] = [];
    if (/somente para retirada/i.test(text)) flags.push("somente retirada");
    if (/indispon|esgotad/i.test(text)) flags.push("indisponível");
    const j = blk.match(/"price":\s*([\d.]+)/)?.[1];
    if (j && Math.abs(Number(j) - brl(sale)) > 0.005) flags.push(`divergência: lista mostra ${sale.trim()} e data-json ${j}`);
    hits.push({ name: name.replace(/&#39;/g, "'").replace(/&amp;/g, "&"), price: brl(sale), url: new URL(href, "https://www.superpaguemenos.com.br").href, flags });
  }
  return hits;
}

const pick = (hs: Hit[]) => hs.sort((a, b) => a.price - b.price)[0];
const rows: any[] = [];
for (const it of CESTA) {
  const row: any = { item: it.label };
  try {
    let r;
    try { r = await cov.search(it.query, "13340-503", { limit: 24 }); }
    catch (e) { if (String(e).includes("HTTP 5")) r = await cov.search(it.query, "13340-503", { limit: 24 }); else throw e; } // 1 nova tentativa em erro 5xx
    const m = r.candidates.filter((c) => c.available && c.price !== null && matches(c.name, it)).map((c) => ({ name: c.name, price: c.price!, url: c.url, flags: c.notes.filter((n) => !/10000/.test(n)) }));
    row.covabra = { ncand: r.candidates.length, nmatch: m.length, escolhido: pick(m) ?? null };
  } catch (e) { row.covabra = { erro: String(e).slice(0, 150) }; }
  try {
    const h = await pagueMenos(it.query);
    const m = h.filter((x) => !x.flags.includes("indisponível") && matches(x.name, it));
    row.paguemenos = { ncand: h.length, nmatch: m.length, escolhido: pick(m) ?? null };
  } catch (e) { row.paguemenos = { erro: String(e).slice(0, 150) }; }
  rows.push(row);
  console.log(`${it.label}: covabra=${row.covabra.escolhido?.price ?? "—"} | pm=${row.paguemenos.escolhido?.price ?? "—"}`);
}
await writeFile(new URL("../../docs/evidencias/teste-cesta.json", import.meta.url).pathname, JSON.stringify({ quando: new Date().toISOString(), cep: "13340-503", rows, logs: logger.entries }, null, 2));
console.log("logs:", logger.entries.length);
