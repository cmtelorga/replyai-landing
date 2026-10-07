/** Parser mínimo de robots.txt para o grupo "User-agent: *" (Allow/Disallow com * e $). */
export interface RobotsRules {
  disallow: string[];
  allow: string[];
}

export function parseRobots(txt: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [] };
  let inStar = false;
  let seenRule = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      // um novo grupo começa quando um user-agent aparece depois de regras
      if (seenRule) { inStar = false; seenRule = false; }
      if (val === "*") inStar = true;
    } else if (inStar && (key === "disallow" || key === "allow")) {
      seenRule = true;
      if (!val) continue;
      (key === "disallow" ? rules.disallow : rules.allow).push(val);
    }
  }
  return rules;
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  return new RegExp("^" + body + (anchored ? "$" : ""));
}

/** pathAndQuery = pathname + search. A regra mais longa vence; empate favorece Allow (RFC 9309). */
export function isAllowed(rules: RobotsRules, pathAndQuery: string): boolean {
  let best: { len: number; allow: boolean } | null = null;
  const consider = (patterns: string[], allow: boolean) => {
    for (const p of patterns) {
      if (toRegex(p).test(pathAndQuery) && (!best || p.length > best.len || (p.length === best.len && allow))) {
        best = { len: p.length, allow };
      }
    }
  };
  consider(rules.disallow, false);
  consider(rules.allow, true);
  return best ? (best as { allow: boolean }).allow : true;
}
