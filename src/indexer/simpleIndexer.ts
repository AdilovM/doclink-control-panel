import { promises as fs } from "node:fs";
import { join, relative } from "node:path";
import { argv, cwd } from "node:process";

type Args = {
  repo: string;
  commit: string;
  outDir: string;
};

type SymbolRecord = {
  symbol: string;
  path: string;
  startLine: number;
  endLine?: number;
  commit: string;
  callers?: string[];
  callees?: string[];
};

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".cs")) {
      files.push(full);
    }
  }
  return files;
}

function parseArgs(): Args {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;

    // Handle --key=value
    if (token.includes("=")) {
      const [rawKey, ...rest] = token.split("=");
      const value = rest.join("="); // preserve any '=' in value
      if (value) {
        args[rawKey.replace(/^--/, "")] = value;
        continue;
      }
    }

    // Handle --key value
    const key = token.replace(/^--/, "");
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++; // skip the value we just consumed
    }
  }

  const repo = args.repo ?? join(cwd(), "repo");
  const commit = args.commit;
  const outDir = args.out ?? join(cwd(), "data", "index", commit ?? "UNKNOWN");
  if (!commit) {
    throw new Error("Missing required --commit=<hash> (or --commit <hash>)");
  }
  return { repo, commit, outDir };
}

function extractSymbols(contents: string, relPath: string, commit: string): SymbolRecord[] {
  const lines = contents.split(/\r?\n/);
  let currentNamespace = "";
  const classStack: string[] = [];
  const records: SymbolRecord[] = [];

  const namespaceRegex = /^\s*namespace\s+([\w\.]+)/;
  const classRegex = /^\s*(public|private|protected|internal|sealed|abstract|static|partial|\s)*\s*(class|interface|struct)\s+([A-Za-z_][\w]*)/;
  const methodRegex =
    /^\s*(public|private|protected|internal|static|virtual|override|async|sealed|partial|\s)+\s*([\w<>\[\],\s?]+)\s+([A-Za-z_][\w]*)\s*\([^;]*\)\s*(?:\{|=>)/;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const nsMatch = line.match(namespaceRegex);
    if (nsMatch) {
      currentNamespace = nsMatch[1];
      continue;
    }
    const classMatch = line.match(classRegex);
    if (classMatch) {
      const className = classMatch[3];
      classStack.push(className);
      const symbol = [currentNamespace, ...classStack].filter(Boolean).join(".");
      records.push({
        symbol,
        path: relPath,
        startLine: idx + 1,
        commit
      });
      continue;
    }
    const methodMatch = line.match(methodRegex);
    if (methodMatch && classStack.length > 0) {
      const methodName = methodMatch[3];
      const symbol = [currentNamespace, ...classStack, methodName].filter(Boolean).join(".");
      records.push({
        symbol,
        path: relPath,
        startLine: idx + 1,
        commit
      });
    }
    if (line.includes("}")) {
      // Naive class stack unwind: pop when we see a closing brace at column 0.
      if (/^\s*}\s*$/.test(line) && classStack.length > 0) {
        classStack.pop();
      }
    }
  }
  return records;
}

async function main() {
  const { repo, commit, outDir } = parseArgs();
  console.log(`Indexing repo=${repo} commit=${commit} -> ${outDir}`);

  const files = await walk(repo);
  const allSymbols: SymbolRecord[] = [];

  for (const file of files) {
    const rel = relative(repo, file).replace(/\\/g, "/");
    const contents = await fs.readFile(file, "utf8");
    const symbols = extractSymbols(contents, rel, commit);
    allSymbols.push(...symbols);
  }

  await fs.mkdir(outDir, { recursive: true });
  const symbolPath = join(outDir, "symbol_graph.jsonl");
  const metadataPath = join(outDir, "metadata.json");

  const lines = allSymbols.map((r) => JSON.stringify(r));
  await fs.writeFile(symbolPath, lines.join("\n") + "\n", "utf8");
  await fs.writeFile(metadataPath, JSON.stringify({ commit, generatedAt: new Date().toISOString() }, null, 2), "utf8");

  console.log(`Wrote ${allSymbols.length} symbols to ${symbolPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
