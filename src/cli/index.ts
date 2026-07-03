#!/usr/bin/env node
/**
 * AdCP Agent Suite CLI.
 *
 *   adcp demo               Run the full buy/sell/creative lifecycle end-to-end
 *   adcp serve [--port N]   Start the HTTP agent (REST + JSON-RPC + well-known)
 *   adcp discover --brief   Run product discovery against the sales agent
 *   adcp capabilities       Print the agent node capabilities
 *
 * The demo is deterministic (fixed clock + sequential ids) so its output is
 * stable and reproducible.
 */
import { createSuite } from "../suite.js";
import { FixedClock } from "../core/index.js";
import { startHttpServer } from "../http/server.js";
import { SalesAgent } from "../agents/sales-agent.js";
import { CreativeAgent } from "../agents/creative-agent.js";
import { SignalsAgent } from "../agents/signals-agent.js";
import type { CampaignBrief } from "../buyer/orchestrator.js";
import type { DeliveryReport } from "../buyer/clients.js";

const log = (s = "") => process.stdout.write(s + "\n");
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;

function money(n: number, cur = "USD"): string {
  return `${cur === "USD" ? "$" : cur + " "}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function num(n: number): string {
  return n.toLocaleString("en-US");
}

const DEMO_BRIEF: CampaignBrief = {
  name: "AcmeOutdoorQ2",
  brief:
    "Premium sports video inventory for Q2 2026, targeting 25-45 outdoor recreation enthusiasts. Reach across CTV and online video.",
  brand: { domain: "acmeoutdoor.com", name: "Acme Outdoor" },
  account: {
    brand: { domain: "acmeoutdoor.com" },
    operator: "pinnacle-agency.com",
    billing: "operator",
  },
  total_budget: 50000,
  currency: "USD",
  channels: ["ctv", "olv", "audio", "display"],
  start_time: "2026-04-01T00:00:00.000Z",
  end_time: "2026-06-30T23:59:59.000Z",
  max_products: 3,
  signal_spec: "Outdoor recreation enthusiasts near sporting goods retailers, 25-45",
};

async function runDemo(): Promise<void> {
  log(bold("\n🛰  AdCP Agent Suite — end-to-end campaign orchestration\n"));

  const stepIcons: Record<string, string> = {
    discover: "🔎",
    select: "🎯",
    signals: "📡",
    creative: "🎨",
    govern: "⚖️ ",
    sync_accounts: "🤝",
    sync_creatives: "🖼 ",
    create_media_buy: "🚀",
  };

  const suite = createSuite({
    deterministic: true,
    startTime: "2026-03-15T00:00:00.000Z",
    onEvent: (e) => {
      const icon = stepIcons[e.step] ?? "•";
      log(`  ${icon} ${dim(e.step.padEnd(16))} ${e.message}`);
    },
  });

  const brief = DEMO_BRIEF;
  log(bold("Campaign brief"));
  log(`  ${dim("name    ")} ${brief.name}`);
  log(`  ${dim("brand   ")} ${brief.brand.name} (${brief.brand.domain})`);
  log(`  ${dim("budget  ")} ${money(brief.total_budget)}`);
  log(`  ${dim("flight  ")} ${brief.start_time.slice(0, 10)} → ${brief.end_time.slice(0, 10)}`);
  log(`  ${dim("brief   ")} ${brief.brief}`);
  log("");
  log(bold("Orchestration"));

  const result = await suite.orchestrator.runCampaign(brief);
  log("");

  if (result.status !== "executed") {
    log(yellow(`Campaign not executed: ${result.status}`));
    if (result.governance.result === "denied") log(yellow(`  reason: ${result.governance.reason}`));
    return;
  }

  log(bold("Media buys"));
  for (const { seller, media_buy } of result.media_buys) {
    log(`  ${cyan(media_buy.media_buy_id)} @ ${seller} — ${money(media_buy.total_budget, media_buy.currency)} — ${media_buy.status}`);
    for (const p of media_buy.packages) {
      log(
        `      ${dim("pkg")} ${p.product_id.padEnd(34)} ${money(p.budget).padStart(11)}  ` +
          `${p.pricing_model.toUpperCase()} @ ${p.effective_price}  creatives:${p.creative_ids.length}  signals:${p.signal_ids.length}`,
      );
    }
  }
  log("");

  // Advance the flight and pull delivery at 50% and 100%.
  const clock = suite.runtime.clock as FixedClock;

  log(bold("Delivery — mid-flight (≈50%)"));
  clock.set("2026-05-16T00:00:00.000Z");
  printDelivery(await suite.orchestrator.collectDelivery(result));

  log("");
  log(bold("Delivery — end of flight (100%)"));
  clock.set("2026-07-01T00:00:00.000Z");
  const finalReports = await suite.orchestrator.collectDelivery(result);
  printDelivery(finalReports);

  // Record downstream conversions for attribution, then close the loop.
  const conversions = await suite.orchestrator.recordConversions(result, [
    { event_id: "evt_1", event_type: "purchase", event_time: "2026-06-20T10:30:00.000Z", custom_data: { value: 149.99, currency: "USD" } },
    { event_id: "evt_2", event_type: "lead", event_time: "2026-06-21T14:00:00.000Z" },
  ]);
  await suite.orchestrator.sendFeedback(result, 1.28);
  log("");
  log(`  ${green("✓")} ${conversions} conversion event(s) logged for attribution`);
  log(`  ${green("✓")} performance feedback submitted (index 1.28)`);

  log("");
  log(bold("Governance audit trail") + dim(`  (plan ${result.plan_id})`));
  for (const entry of suite.governance.getAuditLog(result.plan_id)) {
    log(`  ${dim(entry.timestamp.slice(11, 19))} ${entry.actor.padEnd(16)} ${entry.action}`);
  }

  const totalSpend = finalReports.reduce((s, r) => s + r.spend.amount, 0);
  const totalImp = finalReports.reduce((s, r) => s + r.impressions, 0);
  log("");
  log(green(bold(`✓ Campaign complete — ${num(totalImp)} impressions, ${money(totalSpend)} delivered`)));
  log("");
}

function printDelivery(reports: DeliveryReport[]): void {
  for (const r of reports) {
    log(
      `  ${cyan(r.media_buy_id)}  ${r.status.padEnd(10)} ` +
        `imp ${num(r.impressions).padStart(11)}  clicks ${num(r.clicks).padStart(7)}  ` +
        `ctr ${(r.ctr * 100).toFixed(2)}%  spend ${money(r.spend.amount)}  pacing ${(r.pacing * 100).toFixed(0)}%`,
    );
    for (const p of r.by_package) {
      log(
        `      ${dim(p.product_id.padEnd(34))} imp ${num(p.impressions).padStart(11)}  ` +
          `spend ${money(p.spend).padStart(11)}  vtr ${(p.completion_rate * 100).toFixed(0)}%`,
      );
    }
  }
}

async function runServe(port: number): Promise<void> {
  const node = {
    name: "suite",
    sales: new SalesAgent(),
    creative: new CreativeAgent(),
    signals: new SignalsAgent(),
  };
  const server = await startHttpServer({ node, port });
  log(green(`AdCP HTTP agent listening on ${server.url}`));
  log(dim("  GET  /capabilities"));
  log(dim("  GET  /tasks"));
  log(dim("  POST /tasks/:name"));
  log(dim("  POST /rpc"));
  log(dim("  GET  /.well-known/adagents.json"));
  log(dim("  GET  /.well-known/brand.json"));
  log(dim("\nPress Ctrl+C to stop."));
}

async function runDiscover(briefText: string): Promise<void> {
  const sales = new SalesAgent();
  const { products } = sales.getProducts({ buying_mode: "brief", brief: briefText });
  log(bold(`\nDiscovered ${products.length} product(s) for: ${dim(briefText)}\n`));
  for (const p of products) {
    const opt = p.pricing_options[0];
    log(`  ${cyan(p.product_id)}  ${p.name}`);
    log(`      ${dim(p.channels.join(", "))}  ${opt.model.toUpperCase()} ${money(opt.price)}  ${p.description}`);
  }
  log("");
}

function parseFlags(args: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith("--") ? args[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  switch (cmd) {
    case "demo":
      await runDemo();
      break;
    case "serve":
      await runServe(flags.port ? Number(flags.port) : 8787);
      break;
    case "discover":
      await runDiscover(flags.brief ?? "premium sports video inventory");
      break;
    case "capabilities": {
      const sales = new SalesAgent();
      log(JSON.stringify({ agent: sales.agentUrl, products: sales.store.listProducts().length }, null, 2));
      break;
    }
    default:
      log("AdCP Agent Suite");
      log("Usage:");
      log("  adcp demo                     Run the full orchestration lifecycle");
      log("  adcp serve [--port 8787]      Start the HTTP agent");
      log('  adcp discover --brief "..."   Discover inventory from a brief');
      log("  adcp capabilities             Show agent capabilities");
      if (cmd && cmd !== "help") process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
