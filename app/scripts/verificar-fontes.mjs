// Verificação de fontes (Fase 1, passo 1). Só leitura, respeita robots.txt, 1 req/3s por domínio.
// Não tenta contornar bloqueios: registra 403/429/desafio e segue.
import { mkdir, writeFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileP = promisify(execFile);

const UA = "ComparadorMercadoPrototipo/0.1 (pesquisa de viabilidade; contato: cmte.lorga@gmail.com)";
const DELAY_MS = 3000;
const MARKETS = {
  carrefour: "https://mercado.carrefour.com.br",
  paodeacucar: "https://www.paodeacucar.com",
  paguemenos: "https://www.superpaguemenos.com.br",
  covabra: "https://www.covabra.com.br",
};
const OUT = new URL("../../docs/evidencias/", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Usa curl (respeita o proxy do ambiente); o fetch do Node não passa pelo proxy aqui.
async function get(url) {
  await sleep(DELAY_MS);
  try {
    const tmp = await mkdtemp(join(tmpdir(), "vf-"));
    await execFileP("curl", ["-sS", "-L", "-m", "25", "-A", UA, "-H", "accept: text/html,*/*", "-D", join(tmp, "h"), "-o", join(tmp, "b"), url], { maxBuffer: 50e6 });
    const rawH = await readFile(join(tmp, "h"), "utf8");
    const body = await readFile(join(tmp, "b"), "utf8");
    await rm(tmp, { recursive: true, force: true });
    const lastHead = rawH.split(/\r?\n\r?\n/).filter((x) => /^HTTP\//.test(x)).at(-1) || "";
    const status = Number((lastHead.match(/^HTTP\/[\d.]+ (\d+)/) || [])[1] || 0);
    const headers = Object.fromEntries([...lastHead.matchAll(/^([\w-]+):\s*(.*)$/gm)].map((m) => [m[1].toLowerCase(), m[2].trim()]));
    if (/Host not in allowlist/i.test(body.slice(0, 300))) return { url, status, headers, body, blocked: false, error: "PROXY_DO_AMBIENTE: host fora da allowlist (não é bloqueio do mercado)" };
    const blocked = status === 403 || status === 429 || headers["cf-mitigated"] === "challenge" || /captcha|challenge-platform|Just a moment/i.test(body.slice(0, 5000));
    return { url, status, headers, body, blocked };
  } catch (e) {
    return { url, status: 0, headers: {}, body: "", blocked: false, error: String(e).slice(0, 200) };
  }
}

function parseRobots(txt) {
  const dis = []; let on = false;
  for (const raw of txt.split(/\r?\n/)) {
    const l = raw.split("#")[0].trim(); if (!l) continue;
    const [k, ...v] = l.split(":"); const key = k.toLowerCase(), val = v.join(":").trim();
    if (key === "user-agent") on = val === "*";
    else if (on && key === "disallow" && val) dis.push(val);
  }
  return dis;
}
const allowed = (dis, path) => !dis.some((d) => { const re = new RegExp("^" + d.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")); return re.test(path); });

function platform(res) {
  const s = [], t = res.body, h = res.headers;
  if (Object.keys(h).some((k) => k.startsWith("x-vtex")) || /vtexassets|vtexcommercestable|__RUNTIME__|vtex\.render/i.test(t)) s.push("VTEX (indício)");
  if (/cloudflare/i.test(h.server || "")) s.push("CDN Cloudflare");
  if (/akamai/i.test(h.server || "") || h["x-akamai-transformed"]) s.push("Akamai");
  if (/convertiez|io\.convertiez/i.test(t)) s.push("convertiez");
  if (/__NEXT_DATA__/.test(t)) s.push("Next.js");
  return s;
}
const jsonld = (t) => [...t.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => { try { return JSON.parse(m[1]); } catch { return { erro: "JSON-LD inválido" }; } });
const types = (arr) => arr.flatMap((x) => (Array.isArray(x) ? x : [x])).flatMap((x) => (x["@graph"] ? x["@graph"] : [x])).map((x) => x["@type"]).flat().filter(Boolean);

const report = {};
for (const [slug, base] of Object.entries(MARKETS)) {
  const dir = OUT + slug + "/"; await mkdir(dir, { recursive: true });
  const r = { base, quando: new Date().toISOString(), notas: [] };
  const rb = await get(base + "/robots.txt");
  r.robots = { status: rb.status, bloqueado: rb.blocked, disallow: rb.blocked ? [] : parseRobots(rb.body) };
  await writeFile(dir + "robots.txt", rb.body || `(sem corpo; status ${rb.status})`);
  const dis = r.robots.disallow;
  if (rb.blocked) { r.notas.push("robots.txt bloqueado/desafiado: não prosseguir com acesso de servidor."); report[slug] = r; continue; }

  const home = allowed(dis, "/") ? await get(base + "/") : null;
  if (home) {
    await writeFile(dir + "home.html", home.body);
    r.home = { status: home.status, bloqueado: home.blocked, plataforma: platform(home), jsonld: types(jsonld(home.body)) };
    const links = [...home.body.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]{0,80})</gi)].filter((m) => /termo|condi|politica|privacidade|uso/i.test(m[1] + m[2])).map((m) => new URL(m[1], base).href);
    r.termos_links = [...new Set(links)].slice(0, 8);
    const sm = [...home.body.matchAll(/href=["'](\/[^"']*sitemap[^"']*)["']/gi)].map((m) => m[1]);
    r.sitemap_na_home = sm.slice(0, 3);
  }
  // Sitemap (declarado no robots ou padrão)
  const smUrl = (rb.body.match(/^sitemap:\s*(\S+)/im) || [])[1] || base + "/sitemap.xml";
  const sm = await get(smUrl);
  r.sitemap = { url: smUrl, status: sm.status, bloqueado: sm.blocked };
  await writeFile(dir + "sitemap.xml", sm.body.slice(0, 200000));
  let locs = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  // se for índice, desce um nível
  if (locs.length && locs.every((l) => /\.xml/i.test(l))) {
    const prod = locs.find((l) => /product|produto/i.test(l)) || locs[0];
    const sub = await get(prod); r.sitemap.subindice = prod;
    locs = [...sub.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  }
  r.sitemap.urls_amostra = locs.length;
  const cand = locs.find((l) => /\/p(\?|$)|produto|\/p\//i.test(l)) || locs[Math.min(5, locs.length - 1)];
  if (cand) {
    const path = new URL(cand).pathname + new URL(cand).search;
    if (!allowed(dis, path)) r.notas.push(`Página de produto ${cand} proibida pelo robots.txt; não acessada.`);
    else {
      const p = await get(cand); await writeFile(dir + "produto.html", p.body);
      const ld = jsonld(p.body);
      const prod = ld.flatMap((x) => (Array.isArray(x) ? x : x["@graph"] || [x])).find((x) => [x["@type"]].flat().includes("Product"));
      r.produto = { url: cand, status: p.status, bloqueado: p.blocked, jsonld_tipos: types(ld), tem_offers: !!prod?.offers, offers_amostra: prod?.offers ? JSON.stringify(prod.offers).slice(0, 400) : null, plataforma: platform(p) };
      r.notas.push("JSON-LD de produto sem CEP/região: o preço pode ser o da loja padrão, NÃO o do CEP do usuário.");
    }
  } else r.notas.push("Nenhuma URL de produto encontrada no sitemap.");
  report[slug] = r;
}
await writeFile(OUT + "verificacao.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
