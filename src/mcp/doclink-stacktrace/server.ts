type RawFrame = {
  raw: string;
  module?: string;
  type?: string;
  method?: string;
  file?: string;
  line?: number;
};

type ResolvedFrame = {
  raw: string;
  path: string;
  startLine: number;
  snippet: string;
  commit: string;
  confidence: number;
  featureFlags?: string[];
  blame?: string;
};

export type StacktraceResolver = {
  parse(trace: string): RawFrame[];
  resolve(frames: RawFrame[], commit: string): Promise<ResolvedFrame[]>;
};

export class DoclinkStacktraceServer {
  constructor(private readonly resolver: StacktraceResolver) {}

  async resolve(trace: string, commit: string) {
    const frames = this.resolver.parse(trace);
    return this.resolver.resolve(frames, commit);
  }
}

async function main() {
  // TODO: wire the MCP server implementation to the DoclinkStacktraceServer and a concrete resolver.
  console.log("DocLink stacktrace MCP server stub starting. Implement MCP wiring and resolver.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
