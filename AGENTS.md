# Agent instructions — Declr Negotiation Protocol (DNP)

Use this file as the project entry point for AI coding agents (Cursor, Claude Code, and similar).

## Read first (order matters)

1. **`README.md`** — Short public overview: vision, design principles, architecture diagram.

2. **`README.full.local.md`** (if present, **gitignored**) — Full normative prose that used to live in the README: core concepts, protocol specification, Agent Card, roadmap, etc. **Source of truth for protocol semantics during implementation** when this file exists on disk. If it is missing on a clone, ask the maintainer before inventing wire formats or message types.

## Compressed checklist for implementers

- TypeScript strict, Node.js 20+, `"type": "module"`, **npm workspaces only** (not pnpm/yarn) when the monorepo is added.
- Target layout: `packages/protocol` → `packages/strategies` → `packages/agent` → `packages/examples/*`, with TypeScript project references enforcing the dependency order.
- Do not add dependencies without maintainer approval; prefer `tsc` over a bundler for libraries.
- Stateless DNP messages: full `negotiationState.parameters` every time; validate with Zod (or equivalent) plus rules in the full spec trail.
