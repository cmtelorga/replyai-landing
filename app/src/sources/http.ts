import { type SourceLogger, RobotsDisallowedError, SourceBlockedError } from "./types.js";
import { isAllowed, parseRobots, type RobotsRules } from "./robots.js";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
/** Transporte cru. Em produção, fetch; em testes, um fake. */
export type Transport = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;

export const USER_AGENT =
  "ComparadorMercadoPrototipo/0.1 (pesquisa de viabilidade; contato: cmte.lorga@gmail.com)";

export const fetchTransport: Transport = async (url, headers) => {
  const r = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(25_000) });
  return { status: r.status, headers: Object.fromEntries(r.headers), body: await r.text() };
};

export function looksBlocked(res: HttpResponse): boolean {
  return (
    res.status === 403 ||
    res.status === 429 ||
    res.headers["cf-mitigated"] === "challenge" ||
    /captcha|challenge-platform|just a moment/i.test(res.body.slice(0, 5000))
  );
}

export interface PoliteClientOptions {
  market: string;
  transport?: Transport;
  logger: SourceLogger;
  /** intervalo mínimo entre requisições ao mesmo host */
  minIntervalMs?: number;
  cacheTtlMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/** Cliente "educado": UA identificável, robots.txt obrigatório, rate limit por host, cache, registro de bloqueios. */
export class PoliteClient {
  private readonly transport: Transport;
  private readonly minInterval: number;
  private readonly ttl: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private lastRequestAt = new Map<string, number>();
  private robots = new Map<string, RobotsRules>();
  private cache = new Map<string, { at: number; res: HttpResponse }>();
  requestCount = 0;

  constructor(private readonly o: PoliteClientOptions) {
    this.transport = o.transport ?? fetchTransport;
    this.minInterval = o.minIntervalMs ?? 3000;
    this.ttl = o.cacheTtlMs ?? 6 * 60 * 60 * 1000;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? Date.now;
  }

  private logEvent(kind: "bloqueio" | "captcha" | "robots_disallow" | "erro", url: string, detail: string, httpStatus?: number) {
    this.o.logger.log({ market: this.o.market, kind, url, detail, httpStatus, at: new Date(this.now()).toISOString() });
  }

  private async raw(url: string): Promise<HttpResponse> {
    const host = new URL(url).host;
    const last = this.lastRequestAt.get(host);
    if (last !== undefined) {
      const wait = last + this.minInterval - this.now();
      if (wait > 0) await this.sleep(wait);
    }
    this.lastRequestAt.set(host, this.now());
    this.requestCount++;
    return this.transport(url, { "user-agent": USER_AGENT, accept: "application/json,text/html;q=0.8,*/*;q=0.5" });
  }

  private async rulesFor(origin: string): Promise<RobotsRules> {
    const cached = this.robots.get(origin);
    if (cached) return cached;
    const url = `${origin}/robots.txt`;
    const res = await this.raw(url);
    if (looksBlocked(res)) {
      this.logEvent(res.headers["cf-mitigated"] ? "captcha" : "bloqueio", url, "robots.txt bloqueado/desafiado", res.status);
      throw new SourceBlockedError(this.o.market, `robots.txt retornou ${res.status}`);
    }
    // 404 = sem regras. Qualquer outro status que não seja 2xx: falha fechada.
    let rules: RobotsRules;
    if (res.status === 404) rules = { disallow: [], allow: [] };
    else if (res.status >= 200 && res.status < 300) rules = parseRobots(res.body);
    else {
      this.logEvent("erro", url, `robots.txt retornou ${res.status}; acesso recusado por precaução`, res.status);
      throw new SourceBlockedError(this.o.market, `robots.txt retornou ${res.status}`);
    }
    this.robots.set(origin, rules);
    return rules;
  }

  /** GET respeitando robots.txt. Lança RobotsDisallowedError / SourceBlockedError; nunca contorna. */
  async get(url: string): Promise<HttpResponse> {
    const u = new URL(url);
    const hit = this.cache.get(url);
    if (hit && this.now() - hit.at < this.ttl) return hit.res;

    const rules = await this.rulesFor(u.origin);
    if (!isAllowed(rules, u.pathname + u.search)) {
      this.logEvent("robots_disallow", url, "recusado pelo robots.txt");
      throw new RobotsDisallowedError(url);
    }
    const res = await this.raw(url);
    if (looksBlocked(res)) {
      this.logEvent(res.headers["cf-mitigated"] ? "captcha" : "bloqueio", url, "acesso bloqueado/desafiado", res.status);
      throw new SourceBlockedError(this.o.market, `HTTP ${res.status}`);
    }
    if (res.status >= 200 && res.status < 300) this.cache.set(url, { at: this.now(), res });
    return res;
  }
}
