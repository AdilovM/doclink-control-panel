export type SymbolHit = {
  symbol: string;
  path: string;
  startLine: number;
  endLine?: number;
  commit: string;
};

export type StringHit = {
  path: string;
  line: number;
  preview: string;
  commit: string;
};

export type RepoIndexReader = {
  searchSymbol(request: { query: string; commit: string; limit?: number }): Promise<SymbolHit[]>;
  searchString(request: { query: string; commit: string; regex?: boolean; limit?: number }): Promise<StringHit[]>;
  callers(request: { symbol: string; commit: string; limit?: number }): Promise<SymbolHit[]>;
  callees(request: { symbol: string; commit: string; limit?: number }): Promise<SymbolHit[]>;
  snippet(request: { path: string; start: number; end: number; commit: string }): Promise<string>;
  blame?(request: { path: string; line: number; commit: string }): Promise<string>;
};

export class DoclinkRepoServer {
  constructor(private readonly index: RepoIndexReader) {}

  async searchSymbol(query: string, commit: string, limit = 20) {
    return this.index.searchSymbol({ query, commit, limit });
  }

  async searchString(query: string, commit: string, regex = false, limit = 50) {
    return this.index.searchString({ query, commit, regex, limit });
  }

  async callers(symbol: string, commit: string, limit = 20) {
    return this.index.callers({ symbol, commit, limit });
  }

  async callees(symbol: string, commit: string, limit = 20) {
    return this.index.callees({ symbol, commit, limit });
  }

  async snippet(path: string, start: number, end: number, commit: string) {
    return this.index.snippet({ path, start, end, commit });
  }

  async blame(path: string, line: number, commit: string) {
    if (!this.index.blame) {
      throw new Error("Blame is not configured for this server");
    }
    return this.index.blame({ path, line, commit });
  }
}

async function main() {
  // TODO: wire the MCP server implementation to the DoclinkRepoServer and concrete RepoIndexReader.
  console.log("DocLink repo MCP server stub starting. Implement MCP wiring and index readers.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
