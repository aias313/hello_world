/**
 * MCP transport — exposes an AdCP agent node's tasks as MCP tools over stdio,
 * so any MCP client (Claude Desktop, Claude Code, the Inspector, …) can drive
 * the sales, creative, and signals agents directly.
 *
 * Run with: `npm run mcp`  (or `tsx src/mcp/server.ts`)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SalesAgent } from "../agents/sales-agent.js";
import { CreativeAgent } from "../agents/creative-agent.js";
import { SignalsAgent } from "../agents/signals-agent.js";
import { AdcpError } from "../core/index.js";
import { buildRegistry, type AgentNode, type TaskDef } from "../transport/registry.js";

export function createMcpServer(node: AgentNode): McpServer {
  const server = new McpServer(
    { name: `adcp-${node.name}`, version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const tasks = buildRegistry(node);
  for (const task of tasks) {
    registerTask(server, task);
  }
  return server;
}

function registerTask(server: McpServer, task: TaskDef): void {
  const shape = task.input instanceof z.ZodObject ? (task.input.shape as z.ZodRawShape) : {};
  server.registerTool(
    task.name,
    { description: task.description, inputSchema: shape },
    async (args: unknown) => {
      try {
        const result = await task.handler(args ?? {});
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const payload =
          err instanceof AdcpError
            ? err.toJSON()
            : { error: { code: "internal", message: (err as Error).message } };
        return {
          isError: true,
          content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
        };
      }
    },
  );
}

/** Build a full-capability node (sales + creative + signals) for standalone use. */
export function fullNode(name = "suite"): AgentNode {
  return {
    name,
    sales: new SalesAgent(),
    creative: new CreativeAgent(),
    signals: new SignalsAgent(),
  };
}

async function main(): Promise<void> {
  const server = createMcpServer(fullNode());
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error("[adcp] MCP server ready on stdio");
}

// Run when executed directly.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[adcp] MCP server failed:", err);
    process.exit(1);
  });
}
