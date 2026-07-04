/**
 * Suite server — the buyer-facing HTTP surface for non-technical users.
 *
 * Wraps the raw agent transport (createHttpApp: /tasks, /rpc, /.well-known)
 * and adds a friendly campaign API driven by the Orchestrator, plus the web
 * dashboard served at "/". This is what `npm run serve` starts.
 *
 * Campaign API:
 *   GET  /api/overview                     totals across all campaigns
 *   GET  /api/campaigns                    campaign summaries
 *   POST /api/campaigns                    launch a campaign from a simple form payload
 *   GET  /api/campaigns/:planId            full detail (events, audit, delivery)
 *   POST /api/campaigns/:planId/pause      pause every media buy in the campaign
 *   POST /api/campaigns/:planId/resume     resume
 *   POST /api/campaigns/:planId/conversions  log a conversion event
 *   POST /api/campaigns/:planId/feedback   submit a performance index
 *   GET  /api/products?brief=&budget=      discovery preview
 *   GET  /api/signals?spec=                signal discovery preview
 *   GET  /api/creatives                    seller creative library
 *   POST /api/sample                       create a mid-flight sample campaign
 */
import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { createHttpApp, type RunningServer } from "./server.js";
import { createSuite, type Suite } from "../suite.js";
import { AdcpError, parseOrThrow, round2, Channel } from "../core/index.js";
import type { CampaignBrief, CampaignResult } from "../buyer/orchestrator.js";
import type { DeliveryReport } from "../buyer/clients.js";
import { UI_HTML } from "./ui.js";

const LaunchRequest = z.object({
  name: z.string().min(1).max(80),
  brief: z.string().min(1).max(2000),
  brand_name: z.string().min(1).max(80),
  brand_domain: z.string().min(1).max(120),
  total_budget: z.number().positive().max(10_000_000),
  start_time: z.string(),
  end_time: z.string(),
  channels: z.array(Channel).optional(),
  signal_spec: z.string().max(500).optional(),
});

export interface SuiteServerOptions {
  suite?: Suite;
  operator?: string;
}

interface StoredCampaign {
  result: CampaignResult;
  brief: CampaignBrief;
  created_at: string;
  feedback: number[];
  conversions: number;
}

type Handler = (req: Request, res: Response) => unknown | Promise<unknown>;

export function createSuiteApp(opts: SuiteServerOptions = {}): { app: Express; suite: Suite } {
  const suite = opts.suite ?? createSuite();
  const operator = opts.operator ?? "pinnacle-agency.com";
  const campaigns = new Map<string, StoredCampaign>();

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // The dashboard.
  app.get("/", (_req, res) => {
    res.type("html").send(UI_HTML);
  });

  const api = express.Router();

  // Express 4 does not forward rejected async handlers to error middleware;
  // wrap every handler so thrown AdcpError/ZodError reach the JSON error hook.
  const h =
    (fn: Handler) =>
    (req: Request, res: Response, next: express.NextFunction): void => {
      Promise.resolve()
        .then(() => fn(req, res))
        .catch(next);
    };

  /* ---------------------------- overview --------------------------- */

  api.get(
    "/overview",
    h(async (_req, res) => {
      const rows = await Promise.all([...campaigns.values()].map((c) => summarize(suite, c)));
      const executed = rows.filter((r) => r.status === "executed");
      res.json({
        campaigns: rows.length,
        active: executed.filter((r) => r.delivery_status === "active").length,
        total_spend: round2(executed.reduce((s, r) => s + r.spend, 0)),
        total_budget: round2(executed.reduce((s, r) => s + r.budget, 0)),
        impressions: executed.reduce((s, r) => s + r.impressions, 0),
        clicks: executed.reduce((s, r) => s + r.clicks, 0),
      });
    }),
  );

  /* ---------------------------- campaigns -------------------------- */

  api.get(
    "/campaigns",
    h(async (_req, res) => {
      const rows = await Promise.all(
        [...campaigns.values()]
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map((c) => summarize(suite, c)),
      );
      res.json({ campaigns: rows });
    }),
  );

  api.post(
    "/campaigns",
    h(async (req, res) => {
      const input = parseOrThrow(LaunchRequest, req.body, "launch request");
      if (Date.parse(input.end_time) <= Date.parse(input.start_time)) {
        throw AdcpError.invalid("The end date must be after the start date");
      }
      const brief: CampaignBrief = {
        name: input.name,
        brief: input.brief,
        brand: { domain: input.brand_domain, name: input.brand_name },
        account: { brand: { domain: input.brand_domain }, operator, billing: "operator" },
        total_budget: input.total_budget,
        currency: "USD",
        channels: input.channels?.length ? input.channels : undefined,
        start_time: input.start_time,
        end_time: input.end_time,
        max_products: 3,
        signal_spec: input.signal_spec || undefined,
      };
      const result = await suite.orchestrator.runCampaign(brief);
      const stored: StoredCampaign = {
        result,
        brief,
        created_at: new Date().toISOString(),
        feedback: [],
        conversions: 0,
      };
      campaigns.set(result.plan_id, stored);
      res.status(result.status === "executed" ? 201 : 200).json(await detail(suite, stored));
    }),
  );

  api.get(
    "/campaigns/:planId",
    h(async (req, res) => {
      const c = mustGet(campaigns, req.params.planId);
      res.json(await detail(suite, c));
    }),
  );

  api.post(
    "/campaigns/:planId/pause",
    h(async (req, res) => {
      const c = mustGet(campaigns, req.params.planId);
      await setPaused(suite, c, true);
      res.json(await detail(suite, c));
    }),
  );

  api.post(
    "/campaigns/:planId/resume",
    h(async (req, res) => {
      const c = mustGet(campaigns, req.params.planId);
      await setPaused(suite, c, false);
      res.json(await detail(suite, c));
    }),
  );

  api.post(
    "/campaigns/:planId/conversions",
    h(async (req, res) => {
      const c = mustGet(campaigns, req.params.planId);
      const body = z
        .object({
          event_type: z.enum(["purchase", "lead", "sign_up", "add_to_cart"]).default("purchase"),
          value: z.number().nonnegative().optional(),
        })
        .parse(req.body ?? {});
      const accepted = await suite.orchestrator.recordConversions(c.result, [
        {
          event_id: `evt_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
          event_type: body.event_type,
          event_time: new Date().toISOString(),
          action_source: "website",
          custom_data: body.value !== undefined ? { value: body.value, currency: "USD" } : undefined,
        },
      ]);
      c.conversions += accepted;
      res.json({ accepted, total: c.conversions });
    }),
  );

  api.post(
    "/campaigns/:planId/feedback",
    h(async (req, res) => {
      const c = mustGet(campaigns, req.params.planId);
      const body = z.object({ performance_index: z.number().min(0).max(10) }).parse(req.body ?? {});
      await suite.orchestrator.sendFeedback(c.result, body.performance_index);
      c.feedback.push(body.performance_index);
      res.json({ accepted: true, history: c.feedback });
    }),
  );

  /* ---------------------------- discovery -------------------------- */

  api.get(
    "/products",
    h((req, res) => {
      const briefText = String(req.query.brief ?? "").trim();
      const budget = req.query.budget ? Number(req.query.budget) : undefined;
      const { products } = suite.sales.getProducts({
        buying_mode: "brief",
        brief: briefText || undefined,
        max_budget: budget && Number.isFinite(budget) ? budget : undefined,
      });
      res.json({ products });
    }),
  );

  api.get(
    "/signals",
    h((req, res) => {
      const spec = String(req.query.spec ?? "").trim();
      if (!spec) {
        res.json({ signals: suite.signals.store.listSignals().map((s) => ({ ...s, relevance: 0 })) });
        return;
      }
      res.json(suite.signals.getSignals({ signal_spec: spec }));
    }),
  );

  api.get(
    "/creatives",
    h((_req, res) => {
      res.json(suite.sales.listCreatives());
    }),
  );

  api.get(
    "/formats",
    h((_req, res) => {
      res.json(suite.sales.listCreativeFormats());
    }),
  );

  /* ------------------------- sample campaign ----------------------- */

  api.post(
    "/sample",
    h(async (_req, res) => {
      const now = Date.now();
      const day = 86_400_000;
      const brief: CampaignBrief = {
        name: "Sample — Acme Outdoor",
        brief:
          "Premium sports video inventory targeting 25-45 outdoor recreation enthusiasts across CTV and online video.",
        brand: { domain: "acmeoutdoor.com", name: "Acme Outdoor" },
        account: { brand: { domain: "acmeoutdoor.com" }, operator, billing: "operator" },
        total_budget: 50000,
        currency: "USD",
        channels: ["ctv", "olv", "display", "audio"],
        // Mid-flight on purpose so the dashboard shows live delivery immediately.
        start_time: new Date(now - 30 * day).toISOString(),
        end_time: new Date(now + 30 * day).toISOString(),
        max_products: 3,
        signal_spec: "Outdoor recreation enthusiasts near sporting goods retailers, 25-45",
      };
      const result = await suite.orchestrator.runCampaign(brief);
      const stored: StoredCampaign = {
        result,
        brief,
        created_at: new Date().toISOString(),
        feedback: [],
        conversions: 0,
      };
      campaigns.set(result.plan_id, stored);
      res.status(201).json(await detail(suite, stored));
    }),
  );

  app.use("/api", api);

  // Structured errors for the API (mirrors the agent transport's behavior).
  app.use("/api", (err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err instanceof AdcpError) {
      res.status(err.httpStatus).json(err.toJSON());
    } else if (err instanceof z.ZodError) {
      res.status(400).json({
        error: { code: "invalid_request", message: "Invalid request", details: err.issues },
      });
    } else {
      res.status(500).json({ error: { code: "internal", message: (err as Error).message } });
    }
  });

  // Mount the raw AdCP agent transport under the same server so technical
  // users still get /tasks, /rpc, /capabilities and the well-known documents.
  const agentApp = createHttpApp({
    node: { name: "suite", sales: suite.sales, creative: suite.creative, signals: suite.signals },
  });
  app.use(agentApp);

  return { app, suite };
}

/* ------------------------------------------------------------------ */
/* Shapers                                                             */
/* ------------------------------------------------------------------ */

async function collectReports(suite: Suite, c: StoredCampaign): Promise<DeliveryReport[]> {
  if (c.result.status !== "executed") return [];
  return suite.orchestrator.collectDelivery(c.result);
}

async function summarize(suite: Suite, c: StoredCampaign) {
  const reports = await collectReports(suite, c);
  const spend = round2(reports.reduce((s, r) => s + r.spend.amount, 0));
  const impressions = reports.reduce((s, r) => s + r.impressions, 0);
  const clicks = reports.reduce((s, r) => s + r.clicks, 0);
  const budget = c.brief.total_budget;
  return {
    plan_id: c.result.plan_id,
    name: c.brief.name,
    brand: c.brief.brand,
    status: c.result.status,
    delivery_status: reports[0]?.status ?? (c.result.status === "executed" ? "pending_start" : "—"),
    governance: c.result.governance.result,
    budget,
    spend,
    pacing: budget > 0 ? round2(spend / budget) : 0,
    impressions,
    clicks,
    start_time: c.brief.start_time,
    end_time: c.brief.end_time,
    created_at: c.created_at,
    conversions: c.conversions,
  };
}

async function detail(suite: Suite, c: StoredCampaign) {
  const reports = await collectReports(suite, c);
  return {
    summary: await summarize(suite, c),
    brief: c.brief,
    result: c.result,
    delivery: reports,
    audit_log: suite.governance.getAuditLog(c.result.plan_id),
    feedback: c.feedback,
  };
}

async function setPaused(suite: Suite, c: StoredCampaign, paused: boolean): Promise<void> {
  for (const { seller, media_buy } of c.result.media_buys) {
    const conn = suite.sellers.find((s) => s.name === seller)!;
    const { media_buys } = await conn.sales.getMediaBuys({ media_buy_id: media_buy.media_buy_id });
    const current = media_buys[0];
    await conn.sales.updateMediaBuy({
      media_buy_id: media_buy.media_buy_id,
      status: paused ? "paused" : "active",
      package_updates: current.packages.map((p) => ({
        package_id: p.package_id,
        status: paused ? ("paused" as const) : ("active" as const),
      })),
    });
  }
}

function mustGet(map: Map<string, StoredCampaign>, id: string): StoredCampaign {
  const c = map.get(id);
  if (!c) throw AdcpError.notFound(`Campaign ${id}`);
  return c;
}

/* ------------------------------------------------------------------ */
/* Bootstrap                                                           */
/* ------------------------------------------------------------------ */

export function startSuiteServer(
  opts: SuiteServerOptions & { port?: number } = {},
): Promise<RunningServer & { suite: Suite }> {
  const { app, suite } = createSuiteApp(opts);
  return new Promise((resolve) => {
    const server = app.listen(opts.port ?? 0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : (opts.port ?? 0);
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        suite,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
