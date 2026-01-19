import { promises as fs } from "node:fs";
import { join } from "node:path";

export type IndexArtifactPaths = {
  root: string;
  symbolGraph: string;
  textIndex: string;
  configs: string;
  metadata: string;
  pdbMap?: string;
};

export type IndexerConfig = {
  repoPath: string;
  commit: string;
  outputDir: string;
};

export class DoclinkIndexer {
  constructor(private readonly config: IndexerConfig) {}

  async build(): Promise<IndexArtifactPaths> {
    const base = join(this.config.outputDir, this.config.commit);
    await fs.mkdir(base, { recursive: true });

    // TODO: implement actual extraction of symbols, xrefs, and text indices from the DocLink codebase.
    const paths: IndexArtifactPaths = {
      root: base,
      symbolGraph: join(base, "symbol_graph.jsonl"),
      textIndex: join(base, "text_index.sqlite"),
      configs: join(base, "configs_flags.json"),
      metadata: join(base, "metadata.json"),
    };

    await fs.writeFile(paths.metadata, JSON.stringify({ commit: this.config.commit }, null, 2), "utf8");
    return paths;
  }
}

async function main() {
  console.log("Indexer stub: configure repoPath/commit/outputDir to build artifacts.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
