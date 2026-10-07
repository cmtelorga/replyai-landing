/**
 * Teste de fumaça REAL do adapter do Covabra. Só roda com ENABLE_COVABRA_API=true.
 * Usa curl como transporte porque, neste ambiente cloud, o fetch do Node não passa pelo proxy de saída.
 * Uso: ENABLE_COVABRA_API=true npx tsx scripts/smoke-covabra.ts "arroz 5kg" 13340-503
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { CovabraSource, InMemoryLogger, PoliteClient, type Transport } from "../src/sources/index.js";

const run = promisify(execFile);
const curlTransport: Transport = async (url, headers) => {
  const dir = await mkdtemp(join(tmpdir(), "smoke-"));
  try {
    const args = ["-sS", "-L", "--compressed", "-m", "25", "-D", join(dir, "h"), "-o", join(dir, "b")];
    for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
    await run("curl", [...args, url]);
    const head = (await readFile(join(dir, "h"), "utf8")).split(/\r?\n\r?\n/).filter((x) => /^HTTP\//.test(x)).at(-1) ?? "";
    const status = Number(head.match(/^HTTP\/[\d.]+ (\d+)/)?.[1] ?? 0);
    const hdrs = Object.fromEntries([...head.matchAll(/^([\w-]+):\s*(.*)$/gm)].map((m) => [m[1]!.toLowerCase(), m[2]!.trim()]));
    return { status, headers: hdrs, body: await readFile(join(dir, "b"), "utf8") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const [query = "arroz 5kg", cep = "13340-503"] = process.argv.slice(2);
const logger = new InMemoryLogger();
const src = new CovabraSource({ http: new PoliteClient({ market: "covabra", transport: curlTransport, logger }), logger });
console.log("status:", src.status());
if (src.status() === "desativado") {
  console.log("Fonte desativada: defina ENABLE_COVABRA_API=true para rodar. Nenhuma requisição foi feita.");
  process.exit(0);
}
const r = await src.search(query, cep, { limit: 5 });
console.log(JSON.stringify({ coverage: r.coverage, total: r.totalReportedBySource }, null, 2));
for (const c of r.candidates) {
  console.log(`- ${c.name} | R$ ${c.price ?? "—"} (lista ${c.listPrice ?? "—"}) | ean ${c.ean} | ${c.available ? "disp." : "indisp."} | conf ${c.provenance.confidence} | ${c.notes.join("; ")}`);
}
console.log("logs:", JSON.stringify(logger.entries, null, 2));
