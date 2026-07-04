/**
 * HTTP transport — exposes an AdCP agent node over HTTP for A2A-style
 * agent-to-agent calls, plus the `.well-known` discovery documents
 * (adagents.json, brand.json) that let buyers find and trust the agent.
 *
 * Endpoints:
 *   GET  /health                       liveness
 *   GET  /capabilities                 get_adcp_capabilities
 *   GET  /tasks                        list task names
 *   POST /tasks/:name                  invoke a task with a JSON body
 *   POST /rpc                          JSON-RPC 2.0 ({ method, params, id })
 *   GET  /.well-known/adagents.json    publisher agent declaration
 *   GET  /.well-known/brand.json       operator/brand identity
 */
import express, { type Express, type Request, type Response } from "express";
import { AdcpError } from "../core/index.js";
import { buildRegistry, capabilities, type AgentNode, type TaskDef } from "../transport/registry.js";

export interface HttpServerOptions {
  node: AgentNode;
  publisherDomain?: string;
  publisherName?: string;
  agentUrl?: string;
}

export function createHttpApp(opts: HttpServerOptions): Express {
  const { node } = opts;
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // Permissive CORS so browser-based buyer UIs can call the agent directly.
  app.use((req, res, next) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  const tasks = buildRegistry(node);
  const byName = new Map<string, TaskDef>(tasks.map((t) => [t.name, t]));

  const publisherDomain = opts.publisherDomain ?? "streamhaus.tv";
  const publisherName = opts.publisherName ?? "StreamHaus";
  const agentUrl = opts.agentUrl ?? node.sales?.agentUrl ?? `https://ads.${publisherDomain}`;

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", node: node.name });
  });

  app.get("/capabilities", (_req, res) => {
    res.json(capabilities(node, tasks));
  });

  app.get("/tasks", (_req, res) => {
    res.json({ tasks: tasks.map((t) => ({ name: t.name, description: t.description })) });
  });

  app.post("/tasks/:name", async (req: Request, res: Response) => {
    const task = byName.get(req.params.name);
    if (!task) {
      res.status(404).json(new AdcpError("not_found", `Unknown task ${req.params.name}`, 404).toJSON());
      return;
    }
    await runTask(task, req.body, res);
  });

  // JSON-RPC 2.0 endpoint.
  app.post("/rpc", async (req: Request, res: Response) => {
    const { method, params, id } = req.body ?? {};
    const task = typeof method === "string" ? byName.get(method) : undefined;
    if (!task) {
      res.status(404).json({
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
      return;
    }
    try {
      const result = await task.handler(params ?? {});
      res.json({ jsonrpc: "2.0", id: id ?? null, result });
    } catch (err) {
      const e = toAdcp(err);
      res.status(e.httpStatus).json({
        jsonrpc: "2.0",
        id: id ?? null,
        error: { code: -32000, message: e.message, data: e.toJSON().error },
      });
    }
  });

  // Publisher discovery — how a buyer finds this agent (like robots.txt).
  app.get("/.well-known/adagents.json", (_req, res) => {
    res.json({
      version: "1.0",
      publisher: { name: publisherName, domain: publisherDomain },
      agents: [
        {
          url: agentUrl,
          protocol: "mcp",
          capabilities: tasks.map((t) => t.name).filter((n) => n !== "get_adcp_capabilities"),
        },
      ],
    });
  });

  // Operator/brand identity.
  app.get("/.well-known/brand.json", (_req, res) => {
    res.json({
      $schema: "https://adcontextprotocol.org/schemas/v3/brand.json",
      house: { domain: publisherDomain, name: publisherName },
      brands: [
        {
          id: node.name,
          names: [{ en: publisherName }],
          agents: [{ url: agentUrl, protocol: "mcp" }],
        },
      ],
    });
  });

  return app;
}

async function runTask(task: TaskDef, body: unknown, res: Response): Promise<void> {
  try {
    const result = await task.handler(body ?? {});
    res.json(result);
  } catch (err) {
    const e = toAdcp(err);
    res.status(e.httpStatus).json(e.toJSON());
  }
}

function toAdcp(err: unknown): AdcpError {
  if (err instanceof AdcpError) return err;
  return new AdcpError("internal", (err as Error).message ?? "Internal error", 500);
}

export interface RunningServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

/** Start the HTTP server and resolve once it is listening. */
export function startHttpServer(opts: HttpServerOptions & { port?: number }): Promise<RunningServer> {
  const app = createHttpApp(opts);
  return new Promise((resolve) => {
    const server = app.listen(opts.port ?? 0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 0);
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () =>
          new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
