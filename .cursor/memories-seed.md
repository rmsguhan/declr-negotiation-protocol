# Cursor Memories — seed (DNP)

There is no CLI to write Cursor Memories from the terminal. **Init:** open **Cursor Settings → Rules, Modes & Memories → Memories**, then add one memory per numbered block below (or merge into fewer memories).

---

## Memory 1 — Repo identity and spec sources

**Declr Negotiation Protocol (DNP):** peer-to-peer commerce negotiation over **A2A**; payloads in **DataPart** (`kind: "data"`). **Conflict rule:** `AGENTS.md` wins for **structure/tooling/layout**; **protocol semantics** from **`README.full.local.md` when present** plus short **`README.md`**. Do not invent wire formats—use the local full spec or ask the maintainer. Until long spec is merged into README, treat **README.full.local + short README** as the effective spec for implementation.

---

## Memory 2 — Tech stack (non-negotiable)

TypeScript **strict**, Node **20+**, **ESM** (`"type": "module"`). **npm workspaces only** (not pnpm/yarn). **@a2a-js/sdk**, **Express**, **Zod**, **Vitest**, **ESLint + Prettier**. **tsc + project references**, **no bundler**. No new dependencies without explicit approval.

---

## Memory 3 — Monorepo layout

Packages: `@declr/dnp-protocol` → `@declr/dnp-strategies` → `@declr/dnp-agent` → `examples/buyer-agent` & `examples/seller-agent`. Enforce dependency order with **TypeScript project references**. Full file tree: see **Codex bootstrap** `Docs/files-codex/CODEX_BOOTSTRAP_PROMPT.md` in parent Declr workspace if present.

---

## Memory 4 — Protocol invariants

Stateless messages: full **`negotiationState.parameters`** every time. **`contextId` = negotiation ID**. One negotiation = one A2A task. **Six message types only:** proposal, counter, accept, reject, escalate, withdraw. **`roundNumber`** strictly increases per `contextId`. Validate: schema + all parameters + rounds + bounds + non-expired **`metadata.expiresAt`** when set.

---

## Memory 5 — Coding conventions

No `any`; use `unknown` + Zod. **Named exports** in libraries; **default exports** only in `examples/*`. **`Result<T, E>`** for validation/network failures. **Logger** in libraries, not raw `console.log`. **Conventional Commits**, subject ≤72 chars. Do not expand **README.md** protocol detail without maintainer/RFC; use **README.full.local.md** until merged.

---

## Memory 6 — Anti-goals

No **ML/LLM/random** in strategies or orchestrator. No new **message types** or top-level DNP fields without approval. No **database** beyond in-memory demo patterns for v0.1. No **auth** beyond `@a2a-js/sdk` defaults (TODO for production). No **CLI/Docker/deploy** in v0.1. No **payment/settlement** (AP2 roadmap).
