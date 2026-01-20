import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { argv } from "node:process";

type Args = {
  commit: string;
  query?: string;
  path?: string;
  start?: number;
  end?: number;
  mode: "search" | "snippet";
};

function parseArgs(): Args {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [k, ...rest] = token.replace(/^--/, "").split("=");
    const v = rest.length ? rest.join("=") : argv[i + 1]?.startsWith("--") ? "" : argv[++i];
    if (v) args[k] = v;
  }
  const commit = args.commit;
  if (!commit) throw new Error("Missing --commit");
  const mode = args.mode === "snippet" ? "snippet" : "search";
  return {
    commit,
    query: args.query,
    path: args.path,
    start: args.start ? Number(args.start) : undefined,
    end: args.end ? Number(args.end) : undefined,
    mode,
  };
}

async function main() {
  const args = parseArgs();

  const transport = new StdioClientTransport({
    command: "npm",
    args: ["run", "dev:repo"],
    env: {
      ...process.env,
      DOCLINK_REPO: process.env.DOCLINK_REPO,
      DOCLINK_INDEX: process.env.DOCLINK_INDEX,
    },
  });

  const client = new Client({
    name: "local-repo-client",
    version: "0.0.1",
  });

  await client.connect(transport);

  if (args.mode === "snippet") {
    if (!args.path || args.start === undefined || args.end === undefined) {
      throw new Error("snippet mode requires --path --start --end");
    }
    const result = await client.callTool({
      name: "snippet",
      arguments: {
        path: args.path,
        start: args.start,
        end: args.end,
        commit: args.commit,
      },
    });
    console.log(JSON.stringify(result, null, 2));
  } else {
    if (!args.query) {
      throw new Error("search mode requires --query");
    }
    const result = await client.callTool({
      name: "search_symbol",
      arguments: {
        query: args.query,
        commit: args.commit,
      },
    });
    console.log(JSON.stringify(result, null, 2));
  }

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
