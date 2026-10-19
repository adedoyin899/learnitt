export interface SearchCandidate {
  url: string;
  title: string;
  snippet?: string;
  domain: string;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
}

export interface SearchProvider {
  readonly id: string;
  search(options: SearchOptions): Promise<SearchCandidate[]>;
}

export class SearchCapReachedError extends Error {
  readonly isCapReached = true;
  constructor(message: string = "Daily search API quota reached.") {
    super(message);
    this.name = "SearchCapReachedError";
  }
}
