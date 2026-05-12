# Agent instructions — Declr Negotiation Protocol (DNP)

> Durable guidance for coding agents (Cursor, Codex, Claude Code). Parent workspace **Declr** loads Cursor rules from `.cursor/rules/declr-dnp-*.mdc` when you work under `NegotiationProtocol/`.

This file is for **coding agents**. Keep it concise.

---

## Read first (order matters)

1. **`README.md`** — Short public overview: vision, design principles, architecture diagram.

2. **`README.full.local.md`** (if present, **gitignored**) — Full normative prose: core concepts, protocol specification, Agent Card, roadmap, etc. **Source of truth for protocol semantics** when this file exists. If it is missing on a clone, ask the maintainer before inventing wire formats or message types.

**Conflict rule:** For **structure, tooling, and layout**, this `AGENTS.md` and repo conventions win. For **protocol semantics**, **`README.full.local.md` (when present) + short `README.md`** win; if ambiguous, stop and ask.

---

## What this repo is

The **Declr Negotiation Protocol (DNP)** — peer-to-peer negotiation for commerce agents over Google’s [Agent2Agent (A2A)](https://a2a-protocol.org/) protocol.

---

## Tech stack (non-negotiable when code exists)

- TypeScript **strict**, Node.js **20+** LTS, **ESM** (`"type": "module"`).
- **npm workspaces** only (not pnpm/yarn).
- [`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js), **Express**, **Zod**, **Vitest**, **ESLint + Prettier**.
- **`tsc`** with TypeScript project references — **no bundler**.

Do not introduce new dependencies without explicit approval.

---

## Repo layout (target monorepo)

| Package | Purpose | Depends on |
| --- | --- | --- |
| `@declr/dnp-protocol` | Types, Zod schemas, message validation | — |
| `@declr/dnp-strategies` | `NegotiationStrategy` + defaults + `NegotiationOrchestrator` | `dnp-protocol` |
| `@declr/dnp-agent` | A2A executor, server factory, client | `dnp-protocol`, `dnp-strategies`, SDK |
| `examples/buyer-agent`, `examples/seller-agent` | Demos | `dnp-agent` |

Enforce with **TypeScript project references**.

---

## Build and test (from repo root once workspaces exist)

```bash
npm install && npm run build && npm test && npm run lint
```

Use `npm run demo` when example agents exist. Do not declare work complete while build, test, or lint fails.

---

## Coding conventions

- No `any`; use `unknown` + Zod. `as` only at labeled trust boundaries.
- **Named exports** in libraries; **default exports** only in `examples/*` entry points.
- One concept per file; **TSDoc** on exported symbols.
- **`Result<T, E>`** for validation/network failures; throw only for programmer errors.
- **No `console.log` in library packages** — use an injected **`Logger`**; examples may log.
- **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`), subject ≤72 chars, optional scope `feat(protocol): …`.
- LF, UTF-8, no trailing whitespace.

---

## Protocol-level constraints (invariants)

1. **Stateless messages** — Full `negotiationState.parameters` every message; no diffs.
2. **A2A transport** — Payload in `DataPart` (`kind: "data"`). **`contextId` = negotiation ID.**
3. **One negotiation = one A2A task** — Counters are more messages in the same task.
4. **Six message types only:** `proposal`, `counter`, `accept`, `reject`, `escalate`, `withdraw`.
5. **`roundNumber`** strictly increases per `contextId`.
6. **Validation** — Schema + all parameters + monotonic rounds + bounds + non-expired `metadata.expiresAt` when set.

---

## Anti-goals (do NOT)

- No **AI/ML** in strategies or orchestrator (deterministic rule-based only).
- No new **message types** or **top-level DNP fields** without maintainer/RFC approval.
- No **database** / persistence beyond **`InMemoryTaskStore`**-class usage for v0.1 demos.
- No **auth** beyond `@a2a-js/sdk` defaults — `TODO` where production auth is needed.
- No **CLI / Docker / deployment** scripts in v0.1 scope.
- No **payment/settlement** (AP2 is roadmap).
- Do not expand **`README.md`** protocol detail without maintainer/RFC; use **`README.full.local.md`** for long spec until merged.

---

## When unsure

1. Re-read **`README.full.local.md`** (if present) and **`README.md`** for protocol shape.
2. [A2A specification](https://a2a-protocol.org/latest/specification/) for transport.
3. [`@a2a-js/sdk`](https://github.com/a2aproject/a2a-js) for SDK patterns.
4. [Schema.org Product / Offer / Demand](https://schema.org/Product) for catalog JSON-LD.
5. If still unclear, **stop and ask** — do not guess.

---

## Task complete checklist

- Tests and **build** and **lint** green for touched packages.
- New exports have TSDoc; new behavior has tests.
- Conventional Commits.
- Protocol shape changes reflected in **`README.full.local.md`** and/or **`README.md`** per maintainer direction.

---

## PR / summary etiquette

Lead with **why** in one sentence; reference `AGENTS.md` / spec files for invariant-driven changes; list commits; note TODOs tied to roadmap; confirm `npm run build && npm test && npm run lint`.

---

## Tools

Prefer **ripgrep** and editor file tools over ad-hoc shell mangling. If `npm install` fails (e.g. network), report it clearly. Do not run **`npm publish`** unless explicitly asked.
