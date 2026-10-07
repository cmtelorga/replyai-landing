import { z } from "zod";

/** Origem do dado. "mock" nunca pode ser apresentado como real. */
export const SourceKindSchema = z.enum(["api", "extensao", "scraping", "mock"]);
export type SourceKind = z.infer<typeof SourceKindSchema>;

/** Toda observação de preço carrega proveniência completa. */
export const ProvenanceSchema = z.object({
  market: z.string(),
  cep: z.string().regex(/^\d{8}$/),
  /** loja / centro de distribuição / seller que atende o CEP; null se desconhecido */
  store: z.string().nullable(),
  capturedAt: z.string().datetime(),
  url: z.string().url(),
  source: SourceKindSchema,
  /** detalhe livre da fonte, ex.: "vtex_storefront_nao_oficial" */
  sourceDetail: z.string(),
  /** 0–1. Heurística documentada, NÃO calibrada estatisticamente. */
  confidence: z.number().min(0).max(1),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export interface ProductCandidate {
  market: string;
  externalId: string;
  name: string;
  brand: string | null;
  ean: string | null;
  url: string;
  imageUrl: string | null;
  /** null quando o site não informa preço (ex.: indisponível nesse CEP) */
  price: number | null;
  listPrice: number | null;
  /** Preço de cartão/clube. Sempre null aqui: NÃO identificado na fonte. */
  clubPrice: number | null;
  available: boolean;
  /** Texto bruto de unidade da fonte; o normalizador decide, o adapter não chuta. */
  measurementUnit: string | null;
  unitMultiplier: number | null;
  provenance: Provenance;
  /** Divergências encontradas neste item (nunca escondidas). */
  notes: string[];
}

export type Coverage =
  | { serves: true; store: string; regionId: string }
  | { serves: false; reason: string };

export type SourceStatus = "disponivel" | "desativado" | "indisponivel";

export interface SearchOptions {
  limit?: number;
}

export interface SearchResult {
  market: string;
  cep: string;
  query: string;
  /** Se o mercado não atende o CEP, serves=false e candidates=[]; nunca vira lista vazia silenciosa. */
  coverage: Coverage;
  candidates: ProductCandidate[];
  totalReportedBySource: number | null;
}

/** Interface única de fonte de preço (um adapter por mercado). */
export interface PriceSource {
  readonly slug: string;
  /** "desativado" quando a flag está desligada. Não faz requisições. */
  status(): SourceStatus;
  coverage(cep: string): Promise<Coverage>;
  search(query: string, cep: string, opts?: SearchOptions): Promise<SearchResult>;
}

export type LogKind = "bloqueio" | "captcha" | "robots_disallow" | "divergencia" | "erro";

export interface SourceLogEntry {
  market: string;
  kind: LogKind;
  httpStatus?: number;
  url: string;
  detail: string;
  at: string;
}

export interface SourceLogger {
  log(entry: SourceLogEntry): void;
}

export class InMemoryLogger implements SourceLogger {
  entries: SourceLogEntry[] = [];
  log(entry: SourceLogEntry) {
    this.entries.push(entry);
  }
}

export class SourceDisabledError extends Error {
  constructor(market: string, flag: string) {
    super(`Fonte "${market}" desativada (flag ${flag} desligada).`);
    this.name = "SourceDisabledError";
  }
}
export class SourceBlockedError extends Error {
  constructor(market: string, detail: string) {
    super(`Fonte "${market}" bloqueou o acesso: ${detail}. Marcar mercado como indisponível; não contornar.`);
    this.name = "SourceBlockedError";
  }
}
export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt proíbe o acesso a ${url}.`);
    this.name = "RobotsDisallowedError";
  }
}
export class SourceSchemaError extends Error {
  constructor(market: string, detail: string) {
    super(`Resposta de "${market}" fora do formato esperado (${detail}). Não vou adivinhar valores.`);
    this.name = "SourceSchemaError";
  }
}
