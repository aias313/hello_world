# AdCP Agent Suite

A fully functional [AdCP (Ad Context Protocol)](https://adcontextprotocol.org)
agent suite that orchestrates the full agentic-advertising lifecycle —
**buying, selling, and creative management** — across specialized, interoperable
agents.

One brief goes in; inventory is discovered, targeting data is activated,
creative is generated for every required format, the plan is governed, and a
media buy is executed and monitored to completion — all through standard AdCP
tasks over pluggable transports (in-process, HTTP/A2A, or MCP).

```
   brief ──▶ discover ──▶ signals ──▶ creative ──▶ govern ──▶ sync ──▶ buy ──▶ monitor ──▶ feedback
             (sales)     (signals)   (creative)  (gov)     (sales)  (sales)  (sales)     (sales)
```

## Quick start

```bash
npm install
npm run serve         # open http://127.0.0.1:8787 — the web dashboard (no CLI needed)
npm run demo          # or: run the full lifecycle end-to-end in the terminal
npm test              # 63 tests across every agent + transport + API
```

## Web dashboard (for non-technical users)

`npm run serve` starts **AdCP Campaign Studio** — a browser UI that drives the
whole suite with no code, no CLI, and no JSON:

- **Dashboard** — live stat tiles (spend, impressions, clicks), every campaign
  with its status, pacing meter, and flight dates; auto-refreshes.
- **New campaign** — a plain-English form: describe what you want to advertise,
  set a budget and dates, preview matching inventory, and launch. The page then
  shows exactly what the agents did, step by step (searched inventory, chose
  products, activated audience data, generated creatives, governance review,
  placed the buy).
- **Campaign detail** — delivery charts by package (impressions & spend),
  pause/resume buttons, one-click test conversions, performance feedback, and
  the full governance approval trail in plain language.
- **Inventory / Creatives / Audiences** — browse what the seller offers, the
  ads the creative agent built, and available targeting segments.
- **Create sample campaign** — one click seeds a mid-flight campaign so the
  dashboard shows live numbers immediately.

Budgets of $20,000+ automatically route through the governance approval step,
and the UI explains the outcome ("The budget needed a human sign-off — approved
with conditions: …"). Light and dark themes follow your system setting.

The same port still serves everything technical: the campaign REST API under
`/api/*`, the raw AdCP task transport (`/tasks/:name`, `/rpc`), capability
discovery, and the `.well-known` documents.

## Terminal demo

`npm run demo` runs a deterministic, reproducible campaign: it discovers
StreamHaus inventory from a natural-language brief, activates an outdoor-audience
signal, builds creative for four formats, clears governance (with human
escalation for the $50K budget), establishes the commercial account, executes a
media buy, reports delivery at mid-flight and completion, then logs downstream
conversions for attribution and submits performance feedback.

## What's in the suite

| Agent | Role | AdCP tasks implemented |
|-------|------|------------------------|
| **Sales agent** (`src/agents/sales-agent.ts`) | Seller / publisher side | `get_products`, `list_creative_formats`, `sync_creatives`, `list_creatives`, `create_media_buy`, `update_media_buy`, `get_media_buys`, `get_media_buy_delivery`, `provide_performance_feedback`, `sync_accounts`, `list_accounts`, `sync_catalogs`, `sync_audiences`, `sync_event_sources`, `log_event` |
| **Creative agent** (`src/agents/creative-agent.ts`) | Creative generation & management | `build_creative` (multi-format, with conversational refinement), `list_creative_formats`, `list_creatives` |
| **Signals agent** (`src/agents/signals-agent.ts`) | Third-party targeting data | `get_signals`, `activate_signal` |
| **Governance agent** (`src/buyer/governance.ts`) | Trust & human-in-the-loop | `check_governance` (policy + escalation), `get_plan_audit_logs` |
| **Orchestrator** (`src/buyer/orchestrator.ts`) | Buyer-side coordinator | Runs the entire lifecycle across the agents above |

Every task validates its input with [Zod](https://zod.dev) at the protocol
boundary and returns structured, schema-shaped responses. Long-running work
(media buys) transitions through real states (`pending_start → active →
completed`) driven by a deterministic delivery-simulation engine, so buyers can
poll realistic, billing-grade delivery numbers.

## Transports

The agents are transport-agnostic. The same orchestration runs unchanged over:

- **In-process** — direct method calls (`src/buyer/clients.ts` adapters). Fastest; used by the demo and tests.
- **HTTP / A2A** — `src/http/server.ts` exposes REST (`POST /tasks/:name`), JSON-RPC 2.0 (`POST /rpc`), capability discovery, and the `.well-known/adagents.json` + `.well-known/brand.json` documents that let buyers discover and trust the agent. `src/http/client.ts` provides matching clients.
- **MCP** — `src/mcp/server.ts` exposes all tasks as [Model Context Protocol](https://modelcontextprotocol.io) tools over stdio, so Claude (Desktop, Code, or the SDK) can drive the suite directly.

### Run the HTTP agent

```bash
npm run serve                 # listens on http://127.0.0.1:8787
curl -s localhost:8787/capabilities | jq
curl -s localhost:8787/.well-known/adagents.json | jq
curl -s -X POST localhost:8787/tasks/get_products \
  -H 'content-type: application/json' \
  -d '{"buying_mode":"brief","brief":"premium sports ctv video"}' | jq
```

### Use it as an MCP server

```bash
npm run build
```

Then register the built server with any MCP client. Example
`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "adcp": {
      "command": "node",
      "args": ["/absolute/path/to/dist/mcp/server.js"]
    }
  }
}
```

The client will see 20 tools (`get_products`, `create_media_buy`,
`build_creative`, `get_signals`, `sync_accounts`, `log_event`, …) and can run a
complete campaign by chaining them.

## CLI

```bash
adcp demo                       # full orchestration lifecycle (deterministic)
adcp serve --port 8787          # start the web dashboard + HTTP agent
adcp discover --brief "..."     # product discovery from a brief
adcp capabilities               # agent node capabilities
```

(Use `npm run cli -- <command>` before building, or `npx adcp <command>` after
`npm run build`.)

## Architecture

```
src/
  core/            AdCP schemas (Zod) · errors · runtime (clock/ids) · store · pricing · seed data
  agents/
    sales-agent.ts     seller: discovery, buys, delivery, creative review
    creative-agent.ts  creative generation across formats + library
    signals-agent.ts   signal discovery + activation
  buyer/
    clients.ts         transport-agnostic client interfaces + in-proc adapters
    governance.ts      policy checks, human escalation, audit log
    orchestrator.ts    the buyer-side campaign coordinator
  transport/
    registry.ts        task-name → handler registry shared by all transports
  http/
    server.ts          agent transport (REST/JSON-RPC/well-known) + CORS
    client.ts          HTTP clients implementing the buyer interfaces
    suite-server.ts    campaign REST API + serves the web dashboard
    ui.ts              AdCP Campaign Studio (self-contained HTML dashboard)
  mcp/                 MCP stdio server
  suite.ts             factory wiring a full suite together
  cli/                 command-line entrypoint
```

### Design notes

- **Determinism.** All time and id generation flows through an injectable
  `Runtime` (`clock` + `ids`). Tests and the demo use a `FixedClock` +
  sequential ids, so output is fully reproducible; production uses the wall
  clock and random ids.
- **Idempotency.** `create_media_buy`, `build_creative`, and `activate_signal`
  honor idempotency keys and return `replayed: true` on safe retries — matching
  AdCP's trust model.
- **Governance is architectural, not procedural.** The orchestrator cannot
  execute a buy without a governance decision; over-threshold budgets escalate
  to a (pluggable) human approver, and every decision is recorded in an
  append-only audit trail.
- **Multi-seller.** The orchestrator fans a brief out to every connected
  seller, allocates budget across the best products, and executes one media buy
  per seller.

## Testing

```bash
npm test          # vitest, 63 tests
npm run typecheck # tsc --noEmit
```

Coverage spans product discovery & ranking, budget allocation, media-buy
creation/validation/idempotency, the delivery engine (monotonic accrual,
budget-capped spend), creative generation and format-spec review,
signal ranking/activation, account provisioning, catalog/audience sync,
conversion event ingestion, governance approve/escalate/deny paths, the full
orchestrated lifecycle, and an end-to-end campaign run over the HTTP transport.

## About AdCP

AdCP is an open standard from [AgenticAdvertising.org](https://agenticadvertising.org)
that lets AI agents discover inventory, buy media, distribute creative, and
activate data across the advertising ecosystem using one protocol over MCP and
A2A transports. This project is an independent, self-contained reference
implementation of the core buy/sell/creative flows for learning and
experimentation — it is not affiliated with or endorsed by AgenticAdvertising.org.

## License

MIT — see [LICENSE](./LICENSE).
