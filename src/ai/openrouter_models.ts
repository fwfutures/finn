import { config } from "../config";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export type OpenRouterModel = Record<string, unknown> & { id: string };

export interface OpenRouterModelCache {
  fetchedAt: string;
  models: OpenRouterModel[];
}

export interface OpenRouterModelSearchOptions {
  query?: string;
  limit?: number;
  sort?: "recent" | "relevance";
  refresh?: boolean;
  maxAgeMs?: number;
}

export interface OpenRouterModelSearchResult {
  query: string;
  total: number;
  results: Array<{
    id: string;
    name?: string;
    description?: string;
    created?: number | null;
    contextLength?: number | null;
  }>;
  fetchedAt: string;
  source: "cache" | "refresh";
}

const CACHE_FILENAME = "openrouter-models.json";
const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 24;

function getCachePath() {
  return join(dirname(config.databasePath), CACHE_FILENAME);
}

function readCache(): OpenRouterModelCache | null {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) return null;

  try {
    const raw = readFileSync(cachePath, "utf-8");
    const parsed = JSON.parse(raw) as OpenRouterModelCache;
    if (!parsed || !Array.isArray(parsed.models) || typeof parsed.fetchedAt !== "string") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(cache: OpenRouterModelCache) {
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(cache), "utf-8");
}

function isCacheFresh(cache: OpenRouterModelCache, maxAgeMs: number) {
  const fetchedAt = Date.parse(cache.fetchedAt);
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < maxAgeMs;
}

export async function refreshOpenRouterModels(): Promise<OpenRouterModelCache> {
  if (!config.openrouterApiKey) {
    throw new Error("OpenRouter API key not configured");
  }

  const response = await fetch("https://openrouter.ai/api/v1/models", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.openrouterApiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": config.publicUrl,
      "X-Title": "Finn Slack Bot",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter models error: ${response.status} ${error}`);
  }

  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  if (!payload.data || !Array.isArray(payload.data)) {
    throw new Error("OpenRouter models response missing data array");
  }

  const cache: OpenRouterModelCache = {
    fetchedAt: new Date().toISOString(),
    models: payload.data,
  };

  writeCache(cache);
  return cache;
}

export async function getOpenRouterModels(options: {
  refresh?: boolean;
  maxAgeMs?: number;
} = {}): Promise<{ cache: OpenRouterModelCache; source: "cache" | "refresh" }> {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cached = readCache();

  if (!options.refresh && cached && isCacheFresh(cached, maxAgeMs)) {
    return { cache: cached, source: "cache" };
  }

  const fresh = await refreshOpenRouterModels();
  return { cache: fresh, source: "refresh" };
}

function getStringField(model: OpenRouterModel, key: string) {
  const value = model[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberField(model: OpenRouterModel, key: string) {
  const value = model[key];
  return typeof value === "number" ? value : undefined;
}

function getModelCreated(model: OpenRouterModel) {
  return (
    getNumberField(model, "created") ??
    getNumberField(model, "created_at") ??
    getNumberField(model, "updated") ??
    null
  );
}

function getModelContextLength(model: OpenRouterModel) {
  return getNumberField(model, "context_length") ?? null;
}

function scoreModel(model: OpenRouterModel, terms: string[]) {
  if (terms.length === 0) return 0;

  const haystack = [
    model.id,
    getStringField(model, "name"),
    getStringField(model, "description"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      score += term.length > 3 ? 2 : 1;
    }
  }
  if (haystack.startsWith(terms.join(" "))) {
    score += 3;
  }
  return score;
}

export async function searchOpenRouterModels(
  options: OpenRouterModelSearchOptions
): Promise<OpenRouterModelSearchResult> {
  const query = options.query?.trim() ?? "";
  const limit = Math.max(1, Math.min(options.limit ?? 5, 25));
  const { cache, source } = await getOpenRouterModels({
    refresh: options.refresh,
    maxAgeMs: options.maxAgeMs,
  });

  const terms = query ? query.toLowerCase().split(/\s+/).filter(Boolean) : [];

  const scored = cache.models.map((model) => ({
    model,
    score: scoreModel(model, terms),
    created: getModelCreated(model),
  }));

  const filtered = terms.length > 0 ? scored.filter((item) => item.score > 0) : scored;

  const sort = options.sort ?? (terms.length > 0 ? "relevance" : "recent");

  filtered.sort((a, b) => {
    if (sort === "recent") {
      return (b.created ?? 0) - (a.created ?? 0);
    }
    if (b.score !== a.score) return b.score - a.score;
    return (b.created ?? 0) - (a.created ?? 0);
  });

  const results = filtered.slice(0, limit).map((item) => ({
    id: item.model.id,
    name: getStringField(item.model, "name"),
    description: getStringField(item.model, "description"),
    created: item.created,
    contextLength: getModelContextLength(item.model),
  }));

  return {
    query,
    total: filtered.length,
    results,
    fetchedAt: cache.fetchedAt,
    source,
  };
}
