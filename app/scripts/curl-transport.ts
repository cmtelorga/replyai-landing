/** Transporte via curl: neste ambiente cloud o fetch do Node não passa pelo proxy de saída. */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Transport } from "../src/sources/index.js";

const run = promisify(execFile);
export const curlTransport: Transport = async (url, headers) => {
  const dir = await mkdtemp(join(tmpdir(), "curl-"));
  try {
    const args = ["-sS", "-L", "--compressed", "-m", "30", "-D", join(dir, "h"), "-o", join(dir, "b")];
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
