export interface PolymarketMarketSummary {
  acceptingOrders: boolean;
  bestAsk: number | null;
  bestBid: number | null;
  category: string | null;
  clobTokenIds: string[];
  description: string;
  endDate: string | null;
  eventTitle: string | null;
  icon: string | null;
  id: string;
  image: string | null;
  impliedProbability: number | null;
  lastTradePrice: number | null;
  liquidity: number;
  oddsText: string;
  outcomePrices: Array<{ label: string; price: number | null }>;
  question: string;
  resolutionSource: string | null;
  riskFlags: string[];
  slug: string;
  spread: number | null;
  updatedAt: string | null;
  volume: number;
  volume24hr: number;
}

export interface PolymarketNewsItem {
  domain: string;
  seenDate: string;
  sourceCountry: string;
  title: string;
  url: string;
}

export interface KalshiComparable {
  lastPrice: number | null;
  liquidity: number | null;
  noAsk: number | null;
  noBid: number | null;
  status: string;
  ticker: string;
  title: string;
  yesAsk: number | null;
  yesBid: number | null;
}

export interface PolymarketIntelligence {
  alerts: string[];
  generatedAt: string;
  kalshi: {
    items: KalshiComparable[];
    status: string;
  };
  markets: PolymarketMarketSummary[];
  news: {
    items: PolymarketNewsItem[];
    status: string;
  };
  query: string;
  sourceNotes: string[];
}

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const KALSHI_MARKETS_URL = "https://api.elections.kalshi.com/trade-api/v2/markets";

export async function fetchPolymarketMarkets(input: {
  limit?: number | undefined;
  query?: string | undefined;
}): Promise<PolymarketMarketSummary[]> {
  const limit = clampLimit(input.limit ?? 12, 1, 40);

  if (input.query?.trim()) {
    const searchUrl = new URL("/public-search", GAMMA_BASE_URL);
    searchUrl.searchParams.set("q", input.query.trim());
    searchUrl.searchParams.set("limit_per_type", String(Math.min(limit, 20)));
    searchUrl.searchParams.set("active", "true");

    const payload = await fetchJson<GammaSearchResponse>(searchUrl);
    const markets = [
      ...(payload.markets ?? []),
      ...(payload.events ?? []).flatMap((event) =>
        (event.markets ?? []).map((market) => ({ ...market, events: [event] }))
      )
    ];

    return dedupeMarkets(markets)
      .filter((market) => market.active !== false && market.closed !== true)
      .slice(0, limit)
      .map(normalizeGammaMarket);
  }

  const marketsUrl = new URL("/markets", GAMMA_BASE_URL);
  marketsUrl.searchParams.set("active", "true");
  marketsUrl.searchParams.set("closed", "false");
  marketsUrl.searchParams.set("order", "volume_24hr");
  marketsUrl.searchParams.set("ascending", "false");
  marketsUrl.searchParams.set("limit", String(limit));

  const payload = await fetchJson<GammaMarket[]>(marketsUrl);
  return payload.map(normalizeGammaMarket);
}

export async function fetchPolymarketIntelligence(input: {
  limit?: number | undefined;
  query: string;
}): Promise<PolymarketIntelligence> {
  const query = input.query.trim() || "trending prediction markets";
  const [markets, news, kalshi] = await Promise.all([
    fetchPolymarketMarkets({ limit: input.limit, query }),
    fetchNews(query),
    fetchKalshiComparables(query)
  ]);

  const alerts = buildAlerts(markets, kalshi.items);

  return {
    alerts,
    generatedAt: new Date().toISOString(),
    kalshi,
    markets,
    news,
    query,
    sourceNotes: [
      "Polymarket probabilities are implied by tradable YES/NO share prices before fees, spread, slippage, and resolution risk.",
      "Kalshi matches are search-based comparables, not guaranteed contract equivalents.",
      "News results are contextual signals only and should not be treated as probability estimates."
    ]
  };
}

async function fetchNews(query: string): Promise<PolymarketIntelligence["news"]> {
  try {
    const url = new URL(GDELT_DOC_URL);
    url.searchParams.set("query", query);
    url.searchParams.set("mode", "ArtList");
    url.searchParams.set("format", "json");
    url.searchParams.set("maxrecords", "6");
    url.searchParams.set("sort", "hybridrel");

    const payload = await fetchJson<GdeltResponse>(url);
    return {
      items: (payload.articles ?? []).map((article) => ({
        domain: String(article.domain ?? ""),
        seenDate: String(article.seendate ?? ""),
        sourceCountry: String(article.sourcecountry ?? ""),
        title: String(article.title ?? "").trim(),
        url: String(article.url ?? "")
      })),
      status: "ok"
    };
  } catch (error) {
    return { items: [], status: toErrorStatus(error) };
  }
}

async function fetchKalshiComparables(query: string): Promise<PolymarketIntelligence["kalshi"]> {
  try {
    const url = new URL(KALSHI_MARKETS_URL);
    url.searchParams.set("limit", "8");
    url.searchParams.set("search", query);

    const payload = await fetchJson<KalshiResponse>(url);
    return {
      items: (payload.markets ?? []).map((market) => ({
        lastPrice: parseNumber(market.last_price_dollars),
        liquidity: parseNumber(market.liquidity_dollars),
        noAsk: parseNumber(market.no_ask_dollars),
        noBid: parseNumber(market.no_bid_dollars),
        status: String(market.status ?? ""),
        ticker: String(market.ticker ?? ""),
        title: String(market.title ?? ""),
        yesAsk: parseNumber(market.yes_ask_dollars),
        yesBid: parseNumber(market.yes_bid_dollars)
      })),
      status: "ok"
    };
  } catch (error) {
    return { items: [], status: toErrorStatus(error) };
  }
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json",
      "user-agent": "heysalad-sally-polymarket-intelligence/0.1"
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    throw new Error(`${url.hostname} returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function normalizeGammaMarket(market: GammaMarket): PolymarketMarketSummary {
  const outcomes = parseStringArray(market.outcomes);
  const prices = parseStringArray(market.outcomePrices).map(parseNumber);
  const yesPrice = prices[0] ?? null;
  const spread = parseNumber(market.spread) ?? calculateSpread(market.bestBid, market.bestAsk);
  const liquidity = parseNumber(market.liquidityNum) ?? parseNumber(market.liquidity) ?? 0;
  const volume = parseNumber(market.volumeNum) ?? parseNumber(market.volume) ?? 0;
  const volume24hr = parseNumber(market.volume24hr) ?? parseNumber(market.volume24hrClob) ?? 0;
  const event = market.events?.[0];

  return {
    acceptingOrders: Boolean(market.acceptingOrders),
    bestAsk: parseNumber(market.bestAsk),
    bestBid: parseNumber(market.bestBid),
    category: stringOrNull(market.category),
    clobTokenIds: parseStringArray(market.clobTokenIds),
    description: String(market.description ?? ""),
    endDate: stringOrNull(market.endDateIso ?? market.endDate),
    eventTitle: stringOrNull(event?.title),
    icon: stringOrNull(market.icon),
    id: String(market.id ?? market.conditionId ?? market.slug ?? ""),
    image: stringOrNull(market.image),
    impliedProbability: yesPrice,
    lastTradePrice: parseNumber(market.lastTradePrice),
    liquidity,
    oddsText: yesPrice === null ? "No live YES price" : `YES is pricing roughly ${(yesPrice * 100).toFixed(1)}%`,
    outcomePrices: outcomes.map((label, index) => ({ label, price: prices[index] ?? null })),
    question: String(market.question ?? ""),
    resolutionSource: stringOrNull(market.resolutionSource),
    riskFlags: buildMarketRiskFlags({ liquidity, market, spread }),
    slug: String(market.slug ?? ""),
    spread,
    updatedAt: stringOrNull(market.updatedAt),
    volume,
    volume24hr
  };
}

function buildMarketRiskFlags(input: {
  liquidity: number;
  market: GammaMarket;
  spread: number | null;
}): string[] {
  const flags: string[] = [];
  const description = String(input.market.description ?? "").toLowerCase();

  if (input.liquidity < 1_000) {
    flags.push("Thin liquidity");
  }
  if ((input.spread ?? 0) >= 0.05) {
    flags.push("Wide spread");
  }
  if (!input.market.acceptingOrders) {
    flags.push("Not accepting orders");
  }
  if (!input.market.resolutionSource && !description.includes("resolution source")) {
    flags.push("Resolution source needs review");
  }
  if (description.includes("50-50")) {
    flags.push("50-50 fallback clause");
  }
  if (input.market.restricted) {
    flags.push("Restricted market");
  }

  return flags;
}

function buildAlerts(markets: PolymarketMarketSummary[], kalshi: KalshiComparable[]): string[] {
  const alerts = new Set<string>();

  for (const market of markets) {
    if (market.spread !== null && market.spread >= 0.05) {
      alerts.add(`${market.question}: spread is ${(market.spread * 100).toFixed(1)} points.`);
    }
    if (market.liquidity < 1_000) {
      alerts.add(`${market.question}: liquidity is below $1k.`);
    }
    if (market.riskFlags.includes("50-50 fallback clause")) {
      alerts.add(`${market.question}: resolution includes a 50-50 fallback clause.`);
    }
  }

  const firstMarket = markets[0];
  const firstComparable = kalshi.find((item) => item.lastPrice !== null);
  const firstProbability = firstMarket?.impliedProbability;
  const firstKalshiPrice = firstComparable?.lastPrice;
  if (firstProbability !== undefined && firstProbability !== null && firstKalshiPrice !== undefined && firstKalshiPrice !== null) {
    const delta = Math.abs(firstProbability - firstKalshiPrice);
    if (delta >= 0.1) {
      alerts.add(
        `Search comparable gap: Polymarket top result differs from Kalshi top result by ${(delta * 100).toFixed(1)} points.`
      );
    }
  }

  return [...alerts].slice(0, 8);
}

function dedupeMarkets(markets: GammaMarket[]): GammaMarket[] {
  const seen = new Set<string>();
  const results: GammaMarket[] = [];

  for (const market of markets) {
    const key = String(market.id ?? market.conditionId ?? market.slug ?? "");
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(market);
  }

  return results;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function calculateSpread(bestBid: unknown, bestAsk: unknown): number | null {
  const bid = parseNumber(bestBid);
  const ask = parseNumber(bestAsk);
  if (bid === null || ask === null) {
    return null;
  }

  return Math.max(0, ask - bid);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function clampLimit(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function toErrorStatus(error: unknown): string {
  return error instanceof Error ? error.message : "unavailable";
}

interface GammaSearchResponse {
  events?: GammaEvent[] | undefined;
  markets?: GammaMarket[] | undefined;
}

interface GammaEvent {
  markets?: GammaMarket[] | undefined;
  title?: unknown;
}

interface GammaMarket {
  acceptingOrders?: unknown;
  active?: unknown;
  bestAsk?: unknown;
  bestBid?: unknown;
  category?: unknown;
  clobTokenIds?: unknown;
  closed?: unknown;
  conditionId?: unknown;
  description?: unknown;
  endDate?: unknown;
  endDateIso?: unknown;
  events?: GammaEvent[] | undefined;
  icon?: unknown;
  id?: unknown;
  image?: unknown;
  lastTradePrice?: unknown;
  liquidity?: unknown;
  liquidityNum?: unknown;
  outcomePrices?: unknown;
  outcomes?: unknown;
  question?: unknown;
  resolutionSource?: unknown;
  restricted?: unknown;
  slug?: unknown;
  spread?: unknown;
  updatedAt?: unknown;
  volume?: unknown;
  volume24hr?: unknown;
  volume24hrClob?: unknown;
  volumeNum?: unknown;
}

interface GdeltResponse {
  articles?: Array<{
    domain?: unknown;
    seendate?: unknown;
    sourcecountry?: unknown;
    title?: unknown;
    url?: unknown;
  }> | undefined;
}

interface KalshiResponse {
  markets?: Array<{
    last_price_dollars?: unknown;
    liquidity_dollars?: unknown;
    no_ask_dollars?: unknown;
    no_bid_dollars?: unknown;
    status?: unknown;
    ticker?: unknown;
    title?: unknown;
    yes_ask_dollars?: unknown;
    yes_bid_dollars?: unknown;
  }> | undefined;
}
