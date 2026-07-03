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
npm run demo          # run the full buy/sell/creative lifecycle end-to-end
npm test              # 47 tests across every agent + transport
```

`npm run demo` runs a deterministic, reproducible campaign: it discovers
StreamHaus inventory from a natural-language brief, activates an outdoor-audience
signal, builds creative for four formats, clears governance (with human
escalation for the $50K budget), executes a media buy, then reports delivery at
mid-flight and completion.

## What's in the suite

| Agent | Role | AdCP tasks implemented |
|-------|------|------------------------|
| **Sales agent** (`src/agents/sales-agent.ts`) | Seller / publisher side | `get_products`, `list_creative_formats`, `sync_creatives`, `list_creatives`, `create_media_buy`, `update_media_buy`, `get_media_buys`, `get_media_buy_delivery`, `provide_performance_feedback` |
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

The client will see 14 tools (`get_products`, `create_media_buy`,
`build_creative`, `get_signals`, …) and can run a complete campaign by chaining
them.

## CLI

```bash
adcp demo                       # full orchestration lifecycle (deterministic)
adcp serve --port 8787          # start the HTTP agent
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
  http/                Express server (REST/JSON-RPC/well-known) + HTTP clients
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
npm test          # vitest, 47 tests
npm run typecheck # tsc --noEmit
```

Coverage spans product discovery & ranking, budget allocation, media-buy
creation/validation/idempotency, the delivery engine (monotonic accrual,
budget-capped spend), creative generation and format-spec review,
signal ranking/activation, governance approve/escalate/deny paths, the full
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
