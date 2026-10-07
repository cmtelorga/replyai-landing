import { z } from "zod";
import { COVABRA_FLAG, isFlagOn } from "./flags.js";
import type { PoliteClient } from "./http.js";
import {
  type Coverage,
  type PriceSource,
  type ProductCandidate,
  type Provenance,
  type SearchOptions,
  type SearchResult,
  type SourceLogger,
  type SourceStatus,
  SourceBlockedError,
  SourceDisabledError,
  SourceSchemaError,
} from "./types.js";

/**
 * Adapter do Covabra (loja VTEX). Usa a API de VITRINE do próprio site, que é pública e sem login,
 * mas NÃO é uma API oferecida a terceiros. Por isso fica atrás da flag ENABLE_COVABRA_API (desligada por padrão).
 * Estado jurídico: sem página de termos de uso encontrada; parecer pendente. Ver docs/fontes.md.
 *
 * Restrições do robots.txt do Covabra respeitadas por construção: não usamos /busca/*, ?_q= nem ?page=
 * (por isso não há paginação: só `count`).
 */
const BASE = "https://www.covabra.com.br";
const SLUG = "covabra";
const SOURCE_DETAIL = "vtex_storefront_nao_oficial";
const MAX_COUNT = 24;

const RegionsSchema = z.array(
  z.object({
    id: z.string(),
    sellers: z.array(z.object({ id: z.string(), name: z.string().optional() })),
  }),
);

const OfferSchema = z.object({
  Price: z.number().optional(),
  ListPrice: z.number().optional(),
  AvailableQuantity: z.number().optional(),
});
const SellerSchema = z.object({
  sellerId: z.string(),
  sellerDefault: z.boolean().optional(),
  commertialOffer: OfferSchema,
});
const ItemSchema = z.object({
  itemId: z.string(),
  name: z.string().optional(),
  nameComplete: z.string().optional(),
  ean: z.string().nullish(),
  measurementUnit: z.string().nullish(),
  unitMultiplier: z.number().nullish(),
  images: z.array(z.object({ imageUrl: z.string().optional() })).optional(),
  sellers: z.array(SellerSchema),
});
const SearchSchema = z.object({
  recordsFiltered: z.number().optional(),
  products: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      brand: z.string().nullish(),
      link: z.string().optional(),
      items: z.array(ItemSchema),
    }),
  ),
});

export interface CovabraDeps {
  http: PoliteClient;
  logger: SourceLogger;
  env?: Record<string, string | undefined>;
  now?: () => Date;
}

export class CovabraSource implements PriceSource {
  readonly slug = SLUG;
  private blocked = false;
  private coverageCache = new Map<string, Coverage>();

  constructor(private readonly d: CovabraDeps) {}

  private enabled(): boolean {
    return isFlagOn(COVABRA_FLAG, this.d.env);
  }

  status(): SourceStatus {
    if (!this.enabled()) return "desativado";
    return this.blocked ? "indisponivel" : "disponivel";
  }

  private assertEnabled() {
    if (!this.enabled()) throw new SourceDisabledError(SLUG, COVABRA_FLAG);
  }

  private nowIso(): string {
    return (this.d.now?.() ?? new Date()).toISOString();
  }

  private async fetchJson(url: string): Promise<unknown> {
    try {
      const res = await this.d.http.get(url);
      if (res.status < 200 || res.status >= 300) {
        this.d.logger.log({ market: SLUG, kind: "erro", httpStatus: res.status, url, detail: `HTTP ${res.status}`, at: this.nowIso() });
        throw new SourceSchemaError(SLUG, `HTTP ${res.status}`);
      }
      try {
        return JSON.parse(res.body);
      } catch {
        this.d.logger.log({ market: SLUG, kind: "erro", url, detail: "corpo não é JSON", at: this.nowIso() });
        throw new SourceSchemaError(SLUG, "corpo não é JSON");
      }
    } catch (e) {
      if (e instanceof SourceBlockedError) this.blocked = true;
      throw e;
    }
  }

  private normalizeCep(cep: string): string {
    const digits = cep.replace(/\D/g, "");
    if (!/^\d{8}$/.test(digits)) throw new Error(`CEP inválido: "${cep}"`);
    return digits;
  }

  async coverage(cepInput: string): Promise<Coverage> {
    this.assertEnabled();
    const cep = this.normalizeCep(cepInput);
    const cached = this.coverageCache.get(cep);
    if (cached) return cached;

    const url = `${BASE}/api/checkout/pub/regions?country=BRA&postalCode=${cep}`;
    const parsed = RegionsSchema.safeParse(await this.fetchJson(url));
    if (!parsed.success) {
      this.d.logger.log({ market: SLUG, kind: "erro", url, detail: `schema regions: ${parsed.error.message.slice(0, 200)}`, at: this.nowIso() });
      throw new SourceSchemaError(SLUG, "regions");
    }
    const region = parsed.data[0];
    const seller = region?.sellers[0];
    let result: Coverage;
    if (!region || !seller) {
      result = { serves: false, reason: "a fonte não associa nenhum seller a este CEP" };
    } else {
      if (region.sellers.length > 1) {
        this.d.logger.log({ market: SLUG, kind: "divergencia", url, detail: `${region.sellers.length} sellers no CEP; usando o primeiro (${seller.id})`, at: this.nowIso() });
      }
      result = { serves: true, store: seller.id, regionId: Buffer.from(`SW#${seller.id}`).toString("base64") };
    }
    this.coverageCache.set(cep, result);
    return result;
  }

  async search(query: string, cepInput: string, opts: SearchOptions = {}): Promise<SearchResult> {
    this.assertEnabled();
    const cep = this.normalizeCep(cepInput);
    const q = query.trim();
    if (!q) throw new Error("consulta vazia");

    const coverage = await this.coverage(cep);
    if (!coverage.serves) {
      return { market: SLUG, cep, query: q, coverage, candidates: [], totalReportedBySource: null };
    }

    const count = Math.min(Math.max(opts.limit ?? 8, 1), MAX_COUNT);
    const url =
      `${BASE}/api/io/_v/api/intelligent-search/product_search/` +
      `?query=${encodeURIComponent(q)}&count=${count}&regionId=${encodeURIComponent(coverage.regionId)}&locale=pt-BR`;
    const parsed = SearchSchema.safeParse(await this.fetchJson(url));
    if (!parsed.success) {
      this.d.logger.log({ market: SLUG, kind: "erro", url, detail: `schema search: ${parsed.error.message.slice(0, 200)}`, at: this.nowIso() });
      throw new SourceSchemaError(SLUG, "search");
    }

    const capturedAt = this.nowIso();
    const candidates: ProductCandidate[] = [];
    for (const p of parsed.data.products) {
      for (const item of p.items) {
        const seller = item.sellers.find((s) => s.sellerDefault) ?? item.sellers[0];
        if (!seller) continue;
        const o = seller.commertialOffer;
        const price = o.Price && o.Price > 0 ? o.Price : null;
        const listPrice = o.ListPrice && o.ListPrice > 0 ? o.ListPrice : null;
        const available = price !== null && (o.AvailableQuantity ?? 0) > 0;
        const notes: string[] = [];
        let confidence = available ? 0.8 : 0.3;

        if (!available) notes.push("sem preço/estoque neste CEP segundo a fonte");
        if (price !== null && listPrice !== null && listPrice < price) {
          notes.push(`divergência: preço de lista (${listPrice}) menor que o preço (${price})`);
          this.d.logger.log({ market: SLUG, kind: "divergencia", url, detail: `${p.productId}/${item.itemId}: lista ${listPrice} < preço ${price}`, at: capturedAt });
          confidence = 0.5;
        }
        if (o.AvailableQuantity === 10000) {
          notes.push("quantidade 10000 parece valor fixo da fonte; estoque real NÃO confirmado");
        }

        const productUrl = p.link ? new URL(p.link, BASE).href : BASE;
        const provenance: Provenance = {
          market: SLUG,
          cep,
          store: coverage.store,
          capturedAt,
          url: productUrl,
          source: "api",
          sourceDetail: SOURCE_DETAIL,
          confidence,
        };
        candidates.push({
          market: SLUG,
          externalId: item.itemId,
          name: item.nameComplete ?? item.name ?? p.productName,
          brand: p.brand ?? null,
          ean: item.ean ?? null,
          url: productUrl,
          imageUrl: item.images?.[0]?.imageUrl ?? null,
          price,
          listPrice,
          clubPrice: null,
          available,
          measurementUnit: item.measurementUnit ?? null,
          unitMultiplier: item.unitMultiplier ?? null,
          provenance,
          notes,
        });
      }
    }
    return { market: SLUG, cep, query: q, coverage, candidates, totalReportedBySource: parsed.data.recordsFiltered ?? null };
  }
}
