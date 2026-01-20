import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { FsRepoIndexReader } from "./indexReader.js";
import { join } from "node:path";

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

type ToolResponse = { content: Array<{ type: "text"; text: string }> };

function respond(data: unknown): ToolResponse {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function registerTools(server: McpServer, impl: DoclinkRepoServer) {
  server.registerTool(
    "search_symbol",
    {
      title: "Search symbols",
      description: "Search for symbols (types/methods) in the DocLink codebase by name or pattern.",
      inputSchema: z.object({
        query: z.string(),
        commit: z.string(),
        limit: z.number().int().positive().optional()
      })
    },
    async ({ query, commit, limit }) => respond(await impl.searchSymbol(query, commit, limit))
  );

  server.registerTool(
    "search_string",
    {
      title: "Search text",
      description: "Search for text or regex in the DocLink codebase.",
      inputSchema: z.object({
        query: z.string(),
        commit: z.string(),
        regex: z.boolean().optional(),
        limit: z.number().int().positive().optional()
      })
    },
    async ({ query, commit, regex, limit }) => respond(await impl.searchString(query, commit, regex, limit))
  );

  server.registerTool(
    "callers",
    {
      title: "List callers",
      description: "List callers of a symbol in the DocLink codebase.",
      inputSchema: z.object({
        symbol: z.string(),
        commit: z.string(),
        limit: z.number().int().positive().optional()
      })
    },
    async ({ symbol, commit, limit }) => respond(await impl.callers(symbol, commit, limit))
  );

  server.registerTool(
    "callees",
    {
      title: "List callees",
      description: "List callees of a symbol in the DocLink codebase.",
      inputSchema: z.object({
        symbol: z.string(),
        commit: z.string(),
        limit: z.number().int().positive().optional()
      })
    },
    async ({ symbol, commit, limit }) => respond(await impl.callees(symbol, commit, limit))
  );

  server.registerTool(
    "snippet",
    {
      title: "Fetch snippet",
      description: "Fetch a snippet of code by path and line range.",
      inputSchema: z.object({
        path: z.string(),
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
        commit: z.string()
      })
    },
    async ({ path, start, end, commit }) => respond(await impl.snippet(path, start, end, commit))
  );

  server.registerTool(
    "blame",
    {
      title: "Git blame",
      description: "Fetch git blame for a given file and line.",
      inputSchema: z.object({
        path: z.string(),
        line: z.number().int().nonnegative(),
        commit: z.string()
      })
    },
    async ({ path, line, commit }) => respond(await impl.blame(path, line, commit))
  );
}

async function main() {
  const repoRoot = process.env.DOCLINK_REPO ?? join(process.cwd(), "repo");
  const indexRoot = process.env.DOCLINK_INDEX ?? join(process.cwd(), "data", "index");
  const reader: RepoIndexReader = new FsRepoIndexReader({ repoRoot, indexRoot });

  const impl = new DoclinkRepoServer(reader);
  const server = new McpServer(
    { name: "doclink-repo", version: "0.0.1" },
    { capabilities: { tools: {} } }
  );

  registerTools(server, impl);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
