export type DomainResult = {
  domain: string;
  available: boolean;
  price_usd: number | null;
  buy_url: string;
};

function cfBase(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/registrar/domains`;
}
const BUY_URL = "https://www.cloudflare.com/products/registrar/";

function isMockMode(): boolean {
  return process.env.CLOUDFLARE_API_TOKEN === "your_cloudflare_api_token";
}

function cfHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
}

function cleanQuery(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split(".")[0];
}

async function searchCandidates(query: string): Promise<string[]> {
  const res = await fetch(
    `${cfBase()}/search?query=${encodeURIComponent(query)}`,
    { headers: cfHeaders() }
  );
  const json = (await res.json()) as {
    success: boolean;
    result?: { name: string }[];
  };
  if (!json.success || !Array.isArray(json.result)) return [];
  return json.result.map((r) => r.name);
}

async function checkDomain(
  domain: string
): Promise<{ available: boolean; price_usd: number | null }> {
  try {
    const res = await fetch(
      `${cfBase()}/check?domain=${encodeURIComponent(domain)}`,
      { headers: cfHeaders() }
    );
    const json = (await res.json()) as {
      success: boolean;
      result?: { available: boolean; price: number; currency: string };
    };
    if (!json.success || !json.result) return { available: false, price_usd: null };
    const { available, price } = json.result;
    return { available, price_usd: available ? (price ?? null) : null };
  } catch {
    return { available: false, price_usd: null };
  }
}

function sortResults(results: DomainResult[]): DomainResult[] {
  return results.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    if (a.price_usd !== null && b.price_usd !== null) return a.price_usd - b.price_usd;
    if (a.price_usd !== null) return -1;
    if (b.price_usd !== null) return 1;
    return 0;
  });
}

export async function searchDomains(query: string): Promise<DomainResult[]> {
  const name = cleanQuery(query);

  if (isMockMode()) {
    console.warn("⚠️  Domain search running in MOCK MODE");
    return sortResults([
      { domain: `${name}.com`,   available: false, price_usd: null,  buy_url: BUY_URL },
      { domain: `${name}.io`,    available: true,  price_usd: 39.99, buy_url: BUY_URL },
      { domain: `${name}.co`,    available: true,  price_usd: 19.99, buy_url: BUY_URL },
      { domain: `${name}.app`,   available: true,  price_usd: 14.99, buy_url: BUY_URL },
      { domain: `${name}.co.uk`, available: false, price_usd: null,  buy_url: BUY_URL },
      { domain: `${name}.net`,   available: false, price_usd: null,  buy_url: BUY_URL },
      { domain: `${name}.org`,   available: false, price_usd: null,  buy_url: BUY_URL },
      { domain: `${name}.dev`,   available: false, price_usd: null,  buy_url: BUY_URL },
    ]);
  }

  // 1. Discover candidates via Cloudflare's search suggestion endpoint
  const candidates = await searchCandidates(name);
  if (candidates.length === 0) return [];

  // 2. Check availability + price for each candidate in parallel
  const results = await Promise.all(
    candidates.map(async (domain): Promise<DomainResult> => {
      const { available, price_usd } = await checkDomain(domain);
      return { domain, available, price_usd, buy_url: BUY_URL };
    })
  );

  return sortResults(results);
}
