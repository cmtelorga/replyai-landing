import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowed, parseRobots } from "../src/sources/robots.js";

const covabra = parseRobots(readFileSync(new URL("./fixtures/covabra/robots.txt", import.meta.url), "utf8"));

describe("robots.txt do Covabra (fixture gravada em 2026-10-07)", () => {
  it("proíbe busca, checkout e parâmetros _q/page", () => {
    expect(isAllowed(covabra, "/busca/arroz")).toBe(false);
    expect(isAllowed(covabra, "/checkout/")).toBe(false);
    expect(isAllowed(covabra, "/qualquer?_q=arroz")).toBe(false);
    expect(isAllowed(covabra, "/x?page=2")).toBe(false);
  });
  it("permite as rotas de API usadas pelo adapter", () => {
    expect(isAllowed(covabra, "/api/checkout/pub/regions?country=BRA&postalCode=13340503")).toBe(true);
    expect(isAllowed(covabra, "/api/io/_v/api/intelligent-search/product_search/?query=arroz&count=8&regionId=abc&locale=pt-BR")).toBe(true);
  });
});

describe("parseRobots / isAllowed", () => {
  it("ignora grupos de outros user-agents", () => {
    const r = parseRobots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /privado");
    expect(isAllowed(r, "/publico")).toBe(true);
    expect(isAllowed(r, "/privado/x")).toBe(false);
  });
  it("regra mais longa vence; empate favorece Allow", () => {
    const r = parseRobots("User-agent: *\nDisallow: /user/\nAllow: /user/register");
    expect(isAllowed(r, "/user/register")).toBe(true);
    expect(isAllowed(r, "/user/perfil")).toBe(false);
  });
  it("suporta $ de fim de URL", () => {
    const r = parseRobots("User-agent: *\nDisallow: /*.pdf$");
    expect(isAllowed(r, "/a/b.pdf")).toBe(false);
    expect(isAllowed(r, "/a/b.pdf?x=1")).toBe(true);
  });
  it("Disallow vazio não bloqueia nada", () => {
    expect(isAllowed(parseRobots("User-agent: *\nDisallow:"), "/qualquer")).toBe(true);
  });
});
