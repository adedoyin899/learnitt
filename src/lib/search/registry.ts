import { SearchProvider } from "./types";
import { MockSearchProvider } from "./mock-provider";
import { TavilySearchAdapter } from "./tavily-adapter";
import { SEARCH_CONFIG } from "@/lib/config/search";

let activeProvider: SearchProvider | null = null;

export function getSearchProvider(): SearchProvider {
  if (activeProvider) {
    return activeProvider;
  }

  const providerType = SEARCH_CONFIG.DEFAULT_PROVIDER;

  switch (providerType) {
    case "tavily":
      activeProvider = new TavilySearchAdapter();
      break;
    case "mock":
    default:
      activeProvider = new MockSearchProvider();
      break;
  }

  return activeProvider;
}

export function setSearchProvider(provider: SearchProvider | null): void {
  activeProvider = provider;
}
