# Declr Negotiation Protocol (DNP)

> An open, extensible peer-to-peer negotiation protocol for autonomous commerce agents — built on the [Google Agent2Agent (A2A) protocol](https://a2a-protocol.org/) and the [Schema.org](https://schema.org/) commerce vocabulary.

---
## What is Declr ?
What if brands only saw what you wanted them to see?
What if you could shop without being tracked, targeted, or turned into a data point?
What if instead of ads guessing at your intent — you just **declared** it?

Commerce should work for the consumer. Your intent is yours. Your identity stays yours. Brands and providers earn your attention by responding to exactly what you asked for — nothing more.

No profiles. No targeting. No guesswork. Just intent.

## Why a Negotiation protocol

Today's commerce protocols assume a one-way relationship: merchants publish, consumers click. AI agents are starting to change that — agents need to discover each other, propose deals, counter-offer, and reach agreement on behalf of their humans.

**DNP** is the missing layer. It defines a minimal, well-typed message protocol that lets two autonomous agents — buyer-side and seller-side — negotiate a commerce transaction across price, delivery, and other terms, with optional human-in-the-loop approval for major decisions.

DNP is designed to be **vendor-neutral**, **A2A-compatible**, and **open by default**. The intelligence that drives smart negotiation decisions can be proprietary; the wire protocol that lets agents talk to each other should not.

---

## Design Principles

1. **Stateless messaging.** Every message carries the full negotiation state. No agent needs to remember anything to validate the next message.
2. **A2A-native.** DNP rides on top of the Agent2Agent protocol. Any A2A-compatible agent infrastructure can host a DNP-speaking agent.
3. **Schema.org first.** Items, offers, and demands use the standard `Product`, `Offer`, and `Demand` types — not a bespoke schema.
4. **Open protocol, pluggable intelligence.** The protocol and base negotiation strategy classes are open source. The model intelligence that picks counter-offers is your competitive layer.
5. **Human-in-the-loop is a first-class flow.** Agents can escalate to a human at any round. The protocol treats `agent ↔ agent`, `agent ↔ human`, and `human ↔ human` as the same shape.
6. **Forward-compatible.** Today: bilateral peer-to-peer. Tomorrow: brand bidding, auctions, bundling, payment terms — added as new strategies, not protocol rewrites.

---

## Architecture

```
                       ┌───────────────────────────┐
                       │   Central Catalog Server  │
                       │   (Schema.org Products,   │
                       │    Offers, Demands)       │
                       └────────────┬──────────────┘
                                    │
                  discover / list / publish
                                    │
              ┌─────────────────────┴─────────────────────┐
              │                                           │
       ┌──────▼───────┐                            ┌──────▼───────┐
       │ Buyer Agent  │   ← peer-to-peer A2A →    │ Seller Agent │
       │ (DNP-speaking)│   negotiation messages   │ (DNP-speaking)│
       └──────┬───────┘                            └──────┬───────┘
              │                                           │
        escalate                                    escalate
              │                                           │
        ┌─────▼────┐                                ┌─────▼────┐
        │  Human   │                                │  Human   │
        │  (buyer) │                                │ (seller) │
        └──────────┘                                └──────────┘
```

Items live on a central catalog server. Negotiation happens **peer-to-peer between agents over A2A**. Either side can escalate to its human at any round.
