/** Flags de fontes. Tudo desligado por padrão; só "true" ou "1" liga. */
export const COVABRA_FLAG = "ENABLE_COVABRA_API";

export function isFlagOn(name: string, env: Record<string, string | undefined> = process.env): boolean {
  const v = env[name]?.trim().toLowerCase();
  return v === "true" || v === "1";
}
