import { SearchCandidate, SearchOptions, SearchProvider, SearchCapReachedError } from "./types";
import { SEARCH_CONFIG } from "@/lib/config/search";

export interface TavilyAdapterOptions {
  apiKey?: string;
  dailyCap?: number;
}

export class TavilySearchAdapter implements SearchProvider {
  readonly id = "tavily";
  private apiKey: string | undefined;
  private callCount: number = 0;
  private dailyCap: number;

  constructor(options?: TavilyAdapterOptions) {
    this.apiKey = options?.apiKey || process.env.TAVILY_API_KEY;
    this.dailyCap = options?.dailyCap ?? SEARCH_CONFIG.DAILY_SEARCH_CALL_CAP;
  }

  getCallsCount(): number {
    return this.callCount;
  }

  resetCallsCount(): void {
    this.callCount = 0;
  }

  async search(options: SearchOptions): Promise<SearchCandidate[]> {
    if (this.callCount >= this.dailyCap) {
      throw new SearchCapReachedError(
        `Search call cap of ${this.dailyCap} reached for provider 'tavily'.`
      );
    }

    if (!this.apiKey) {
      throw new Error("TAVILY_API_KEY environment variable is not configured.");
    }

    this.callCount++;

    const maxResults = options.maxResults || SEARCH_CONFIG.MAX_RESULTS_PER_QUERY;
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: options.query,
        search_depth: "basic",
        max_results: maxResults,
        include_domains: [],
        exclude_domains: [],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 429) {
        throw new SearchCapReachedError(`Tavily API rate limit or quota exceeded: ${errorText}`);
      }
      throw new Error(`Tavily search API error (${response.status}): ${errorText}`);
    }

    const json = (await response.json()) as {
      results?: Array<{
        title?: string;
        url?: string;
        content?: string;
      }>;
    };

    const results: SearchCandidate[] = [];
    for (const item of json.results || []) {
      if (!item.url) continue;
      let domain = "";
      try {
        domain = new URL(item.url).hostname;
      } catch {
        continue;
      }

      results.push({
        url: item.url,
        title: item.title || domain,
        snippet: item.content,
        domain,
      });
    }

    return results;
  }
}
