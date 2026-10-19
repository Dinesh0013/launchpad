import dns from "dns";
import { z } from "zod";

export const TLD_PRICES: Record<string, number> = {
  com: 10.99,
  co: 25.99,
  io: 32.99,
  app: 14.99,
  dev: 12.99,
  net: 13.99,
};

export const TLDs = ["com", "co", "io", "app", "dev", "net"] as const;

export type Suggestion = {
  domain: string;
  available: boolean;
  price_usd: number;
  confidence: "high" | "low";
  tld: string;
};

export const domainSearchSchema = z.object({
  query: z
    .string()
    .min(2, "query must be at least 2 characters")
    .max(50, "query must be at most 50 characters")
    .refine((q) => !q.includes(" "), { message: "query must not contain spaces" })
    .refine((q) => !/^https?:\/\//i.test(q), { message: "query must not include http or https" }),
});

export function extractName(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split(".")[0];
}

async function checkViaCF(domain: string): Promise<"available" | "taken" | "unknown"> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return "unknown";

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/${domain}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.status === 404) return "available";
    if (res.status === 200) return "taken";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function checkViaDNS(domain: string): Promise<"taken" | "available"> {
  try {
    await dns.promises.resolve(domain);
    return "taken";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (["ENOTFOUND", "ENODATA", "ESERVFAIL", "ENOENT"].includes(code)) {
      return "available";
    }
    return "taken";
  }
}

export async function checkDomainAvailability(domain: string): Promise<{
  available: boolean;
  confidence: "high" | "low";
}> {
  const cf = await checkViaCF(domain);
  if (cf === "available") return { available: true, confidence: "high" };
  if (cf === "taken") return { available: false, confidence: "high" };

  // CF unavailable or inconclusive — fall back to DNS
  const dnsResult = await checkViaDNS(domain);
  return { available: dnsResult === "available", confidence: "low" };
}

export function validateProjectForDomain(project: {
  status: string;
  cloudflare_project_id: string | null;
}): { ok: true } | { ok: false; error: string; code: string } {
  if (project.status !== "live") {
    return {
      ok: false,
      error: "Project must be live before connecting a custom domain",
      code: "NOT_LIVE",
    };
  }
  if (!project.cloudflare_project_id) {
    return {
      ok: false,
      error: "Project has no Cloudflare deployment",
      code: "NO_CF_PROJECT",
    };
  }
  return { ok: true };
}

export async function buildSuggestions(name: string): Promise<Suggestion[]> {
  const results = await Promise.all(
    TLDs.map(async (tld): Promise<Suggestion> => {
      const domain = `${name}.${tld}`;
      const { available, confidence } = await checkDomainAvailability(domain);
      return {
        domain,
        available,
        price_usd: TLD_PRICES[tld],
        confidence,
        tld,
      };
    })
  );
  return results;
}
