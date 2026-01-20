import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import type { RepoIndexReader, StringHit, SymbolHit } from "./server.js";

const execFileAsync = promisify(execFile);

type SymbolRecord = SymbolHit & { callees?: string[]; callers?: string[] };

export type RepoIndexConfig = {
  repoRoot: string;
  indexRoot: string;
};

export class FsRepoIndexReader implements RepoIndexReader {
  private symbolCache: Map<string, SymbolRecord[]> = new Map();

  constructor(private readonly config: RepoIndexConfig) {}

  private async loadSymbols(commit: string): Promise<SymbolRecord[]> {
    if (this.symbolCache.has(commit)) {
      return this.symbolCache.get(commit)!;
    }
    const path = join(this.config.indexRoot, commit, "symbol_graph.jsonl");
    try {
      const raw = await fs.readFile(path, "utf8");
      const records: SymbolRecord[] = raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      this.symbolCache.set(commit, records);
      return records;
    } catch (error) {
      console.warn(`symbol graph not found for ${commit} at ${path}: ${String(error)}`);
      this.symbolCache.set(commit, []);
      return [];
    }
  }

  async searchSymbol(request: { query: string; commit: string; limit?: number }): Promise<SymbolHit[]> {
    const { query, commit, limit = 20 } = request;
    const symbols = await this.loadSymbols(commit);
    const q = query.toLowerCase();
    const hits = symbols.filter((s) => s.symbol.toLowerCase().includes(q)).slice(0, limit);
    return hits;
  }

  async searchString(request: {
    query: string;
    commit: string;
    regex?: boolean;
    limit?: number;
  }): Promise<StringHit[]> {
    const { query, limit = 50, regex = false } = request;
    // Prefer ripgrep if present.
    try {
      const args = ["--json", "--line-number", "--max-count", String(limit), regex ? "--pcre2" : "--fixed-strings", query, "."];
      const { stdout } = await execFileAsync("rg", args, { cwd: this.config.repoRoot, encoding: "utf8" });
      const lines = stdout.split("\n").filter(Boolean);
      const hits: StringHit[] = [];
      for (const line of lines) {
        const event = JSON.parse(line);
        if (event.type !== "match") continue;
        hits.push({
          path: event.data.path.text,
          line: event.data.line_number,
          preview: event.data.lines.text.trim(),
          commit: request.commit
        });
        if (hits.length >= limit) break;
      }
      return hits;
    } catch (error) {
      console.warn(`rg failed, falling back to empty search: ${String(error)}`);
      return [];
    }
  }

  async callers(request: { symbol: string; commit: string; limit?: number }): Promise<SymbolHit[]> {
    const { symbol, commit, limit = 20 } = request;
    const symbols = await this.loadSymbols(commit);
    const target = symbols.filter((s) => s.symbol === symbol);
    const callerSymbols = target.flatMap((s) => s.callers ?? []);
    const hits = symbols.filter((s) => callerSymbols.includes(s.symbol)).slice(0, limit);
    return hits;
  }

  async callees(request: { symbol: string; commit: string; limit?: number }): Promise<SymbolHit[]> {
    const { symbol, commit, limit = 20 } = request;
    const symbols = await this.loadSymbols(commit);
    const target = symbols.filter((s) => s.symbol === symbol);
    const calleeSymbols = target.flatMap((s) => s.callees ?? []);
    const hits = symbols.filter((s) => calleeSymbols.includes(s.symbol)).slice(0, limit);
    return hits;
  }

  async snippet(request: { path: string; start: number; end: number; commit: string }): Promise<string> {
    const filePath = join(this.config.repoRoot, request.path);
    const raw = await fs.readFile(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const slice = lines.slice(request.start - 1, request.end);
    return slice.join("\n");
  }

  async blame(request: { path: string; line: number; commit: string }): Promise<string> {
    // Optional: requires git in PATH and repoRoot to be a git checkout.
    const args = ["blame", "-L", `${request.line},${request.line}`, request.path];
    const { stdout } = await execFileAsync("git", args, { cwd: this.config.repoRoot, encoding: "utf8" });
    return stdout.trim();
  }
}
