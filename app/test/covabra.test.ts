import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CovabraSource,
  InMemoryLogger,
  PoliteClient,
  RobotsDisallowedError,
  SourceBlockedError,
  SourceDisabledError,
  SourceSchemaError,
  USER_AGENT,
  type HttpResponse,
  type Transport,
} from "../src/sources/index.js";

const fx = (n: string) => readFileSync(new URL(`./fixtures/covabra/${n}`, import.meta.url), "utf8");
const ok = (body: string): HttpResponse => ({ status: 200, headers: {}, body });

/** Fixtures = respostas REAIS gravadas em 2026-10-07 (não são MOCK de dados inventados). */
function fakeTransport(over: Partial<Record<string, HttpResponse>> = {}) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const t: Transport = async (url, headers) => {
    calls.push({ url, headers });
    for (const [needle, res] of Object.entries(over)) if (res && url.includes(needle)) return res;
    if (url.endsWith("/robots.txt")) return ok(fx("robots.txt"));
    if (url.includes("postalCode=13340503")) return ok(fx("regions-13340503.json"));
    if (url.includes("postalCode=01310100")) return ok(fx("regions-01310100.json"));
    if (url.includes("product_search") && url.includes("arroz")) return ok(fx("search-arroz-com-regiao.json"));
    if (url.includes("product_search") && url.includes("heineken")) return ok(fx("search-heineken-sem-regiao.json"));
    return { status: 404, headers: {}, body: "" };
  };
  return { t, calls };
}

function setup(env: Record<string, string | undefined>, over: Partial<Record<string, HttpResponse>> = {}) {
  const logger = new InMemoryLogger();
  const { t, calls } = fakeTransport(over);
  let clock = 1_000_000;
  const sleeps: number[] = [];
  const http = new PoliteClient({
    market: "covabra",
    transport: t,
    logger,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    now: () => clock,
  });
  const src = new CovabraSource({ http, logger, env, now: () => new Date("2026-10-07T12:00:00Z") });
  return { src, logger, calls, sleeps, http };
}

const ON = { ENABLE_COVABRA_API: "true" };

describe("flag desligada (padrão)", () => {
  it.each([{}, { ENABLE_COVABRA_API: "false" }, { ENABLE_COVABRA_API: "" }, { ENABLE_COVABRA_API: "talvez" }])(
    "não faz nenhuma requisição e informa 'desativado' (%o)",
    async (env) => {
      const { src, calls } = setup(env);
      expect(src.status()).toBe("desativado");
      await expect(src.search("arroz 5kg", "13340-503")).rejects.toBeInstanceOf(SourceDisabledError);
      await expect(src.coverage("13340-503")).rejects.toBeInstanceOf(SourceDisabledError);
      expect(calls).toHaveLength(0);
    },
  );
});

describe("flag ligada: cobertura", () => {
  it("CEP atendido devolve seller e regionId base64('SW#<seller>')", async () => {
    const { src } = setup(ON);
    const c = await src.coverage("13340-503");
    expect(c).toEqual({ serves: true, store: "covabra26", regionId: Buffer.from("SW#covabra26").toString("base64") });
  });
  it("CEP sem seller NÃO atendido: sem busca de produtos e com motivo explícito", async () => {
    const { src, calls } = setup(ON);
    const r = await src.search("arroz 5kg", "01310-100");
    expect(r.coverage.serves).toBe(false);
    expect(r.candidates).toEqual([]);
    expect(calls.some((c) => c.url.includes("product_search"))).toBe(false);
  });
  it("rejeita CEP inválido", async () => {
    const { src } = setup(ON);
    await expect(src.coverage("123")).rejects.toThrow(/CEP inválido/);
  });
});

describe("flag ligada: busca", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => { ctx = setup(ON); });

  it("mapeia candidatos com preço, lista, EAN, URL absoluta e proveniência completa", async () => {
    const r = await ctx.src.search("arroz 5kg", "13340503", { limit: 4 });
    expect(r.candidates).toHaveLength(4);
    const camil = r.candidates.find((c) => c.name.includes("Camil"))!;
    expect(camil.price).toBe(17.49);
    expect(camil.listPrice).toBe(25.99);
    expect(camil.ean).toBe("7896006711155");
    expect(camil.available).toBe(true);
    expect(camil.url).toBe("https://www.covabra.com.br/arroz-camil-tipo-i-5kg/p");
    expect(camil.clubPrice).toBeNull();
    expect(camil.provenance).toMatchObject({
      market: "covabra", cep: "13340503", store: "covabra26", source: "api",
      sourceDetail: "vtex_storefront_nao_oficial", capturedAt: "2026-10-07T12:00:00.000Z",
    });
    expect(camil.provenance.confidence).toBeGreaterThan(0);
    expect(camil.notes.join(" ")).toMatch(/10000/);
  });

  it("usa o regionId na URL e não usa os padrões proibidos pelo robots.txt", async () => {
    await ctx.src.search("arroz 5kg", "13340503");
    const u = ctx.calls.find((c) => c.url.includes("product_search"))!.url;
    expect(u).toContain(`regionId=${encodeURIComponent(Buffer.from("SW#covabra26").toString("base64"))}`);
    expect(u).not.toMatch(/[?&]_q=|[?&]page=|\/busca\//);
  });

  it("identifica-se com o User-Agent do protótipo", async () => {
    await ctx.src.search("arroz 5kg", "13340503");
    expect(ctx.calls.every((c) => c.headers["user-agent"] === USER_AGENT)).toBe(true);
  });

  it("produto sem preço/estoque vira indisponível com preço null, nunca 0", async () => {
    const r = await ctx.src.search("heineken", "13340503");
    const h = r.candidates[0]!;
    expect(h.price).toBeNull();
    expect(h.available).toBe(false);
    expect(h.notes.join(" ")).toMatch(/sem preço\/estoque/);
    expect(h.provenance.confidence).toBeLessThan(0.5);
  });

  it("registra divergência quando preço de lista < preço", async () => {
    const body = JSON.parse(fx("search-arroz-com-regiao.json"));
    const offer = body.products[0].items[0].sellers[0].commertialOffer;
    offer.ListPrice = offer.Price - 1;
    const c2 = setup(ON, { product_search: ok(JSON.stringify(body)) });
    const r = await c2.src.search("arroz 5kg", "13340503");
    expect(r.candidates[0]!.notes.join(" ")).toMatch(/divergência/);
    expect(c2.logger.entries.some((e) => e.kind === "divergencia")).toBe(true);
    expect(r.candidates[0]!.provenance.confidence).toBe(0.5);
  });

  it("respeita rate limit: espera 3 s entre requisições ao mesmo host", async () => {
    await ctx.src.search("arroz 5kg", "13340503");
    expect(ctx.sleeps.length).toBeGreaterThan(0);
    expect(ctx.sleeps.every((ms) => ms === 3000)).toBe(true);
  });

  it("usa cache: a mesma busca duas vezes gera uma só requisição à API", async () => {
    await ctx.src.search("arroz 5kg", "13340503");
    await ctx.src.search("arroz 5kg", "13340503");
    expect(ctx.calls.filter((c) => c.url.includes("product_search"))).toHaveLength(1);
  });
});

describe("bloqueios e erros (nunca contornados, sempre registrados)", () => {
  it("403 na API → SourceBlockedError, log 'bloqueio' e status 'indisponivel'", async () => {
    const { src, logger } = setup(ON, { product_search: { status: 403, headers: {}, body: "forbidden" } });
    await expect(src.search("arroz 5kg", "13340503")).rejects.toBeInstanceOf(SourceBlockedError);
    expect(logger.entries.some((e) => e.kind === "bloqueio" && e.httpStatus === 403)).toBe(true);
    expect(src.status()).toBe("indisponivel");
  });

  it("desafio Cloudflare → log 'captcha'", async () => {
    const { src, logger } = setup(ON, { "/robots.txt": { status: 403, headers: { "cf-mitigated": "challenge" }, body: "" } });
    await expect(src.coverage("13340503")).rejects.toBeInstanceOf(SourceBlockedError);
    expect(logger.entries.some((e) => e.kind === "captcha")).toBe(true);
  });

  it("robots.txt que proíbe /api/ → RobotsDisallowedError sem chamar a API", async () => {
    const { src, logger, calls } = setup(ON, { "/robots.txt": ok("User-agent: *\nDisallow: /api/") });
    await expect(src.coverage("13340503")).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(logger.entries.some((e) => e.kind === "robots_disallow")).toBe(true);
    expect(calls.every((c) => c.url.endsWith("/robots.txt"))).toBe(true);
  });

  it("formato inesperado → SourceSchemaError e log de erro (não adivinha)", async () => {
    const { src, logger } = setup(ON, { product_search: ok('{"foo":1}') });
    await expect(src.search("arroz 5kg", "13340503")).rejects.toBeInstanceOf(SourceSchemaError);
    expect(logger.entries.some((e) => e.kind === "erro")).toBe(true);
  });
});
