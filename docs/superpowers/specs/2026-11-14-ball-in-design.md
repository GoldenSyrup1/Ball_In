# Ball-In — Kiroween 2026 Design Doc

## Intent
Prove, in a working app plus a 3-minute demo video, that Stall-In's synthetic-equity
bulk-buying pivot is a real, demoable mechanic rather than a dressed-up dropshipping
site: hidden procurement by Stall-In, a profit-contingent commission (0% fee on a
loss), and an offer/negotiation layer between a synthetic seller and a buyer. Scoped
to one product category so the demo proves the core loop, with breadth framed
explicitly as a growth/expansion story rather than something the demo needs to show.

## Goals
- Working end-to-end loop: pre-buy into inventory -> list -> offer/negotiate ->
  accept or decline (opt-in both sides) -> simulated fulfillment -> fee computed,
  0% if the sale nets a loss instead of a profit
- Deep, visible use of Kiro (IDE/CLI, specs, steering docs, at least one hook; MCP
  if time allows) to answer the hackathon write-up questions with substance
- Public GitHub repo under GoldenSyrup1, OSS license visible in the About section,
  `/.kiro` directory committed at the repo root (never gitignored)
- Built genuinely new within the submission window (Oct 30 - Dec 4, 2026); no reuse
  of Stall-In's actual code

## Non-goals
- Real supplier integrations or live/competing market pricing
- Multi-category catalog
- Real payments or physical delivery
- Multi-service/microservice architecture (that's the Skeleton Crew category's ask,
  not Frankenstein's)

## Anti-goals
(would mean failure even if the thing technically runs)
- A demo that reads as plain dropshipping on camera — the profit-contingent fee and
  the pre-commit inventory risk have to be visibly load-bearing, not background trivia
- The supplier-price-vs-competing-offer race condition visibly unhandled or glossed
  over in the walkthrough
- A `/.kiro` directory that's decorative rather than something that actually drove
  the build (judges are explicitly scoring this)

## Constraints
- Solo build, roughly 3 weeks, alongside uni
- Must be new code, not a fork or copy of Stall-In's repo
- Judging rewards variety and depth of Kiro feature use, not just a working app

## Approaches considered
1. **Full category breadth with live-ish supplier simulation** — rejected. Reintroduces
   the supplier-commitment race condition as a live build problem with no payoff
   inside a 3-week solo window.
2. **Single category, small fixed-tier mock-supplier catalog** — chosen. Bulk-buy
   tiers (e.g. buy 10 units @ $X/unit, 50 @ $Y/unit) become a lookup table, not a
   live bidding problem, while the three stitched mechanics stay fully demoable.
3. **Single literal item only** — considered, rejected. Too thin for a judged demo;
   loses the "a pool of sellers is converging on this" visual that sells the pitch.

## Decided (my calls — flag anything you want to override)
- **Scope**: one product category, a handful of mock suppliers at tiered bulk
  prices, no live pricing
- **Stack**: single repo, Node/Express backend with a lightweight Postgres (or
  SQLite if that's faster to stand up solo) + a plain React frontend — no
  microservices, no monorepo split
- **Kiro usage**: spec-driven build via Kiro IDE/CLI; steering docs encoding the
  business rules (bulk-price tiers, profit-contingent fee logic) so Kiro's
  generations stay consistent with them; at least one agent hook (e.g. run tests
  on save)
- **Repo**: new public GitHub repo under GoldenSyrup1, OSS license file visible in
  the About section, `/.kiro` committed at root

## Left open — yours to call
- Exact product/category for the demo (electronics, sneakers, whatever's easiest
  to make visually legible in 3 minutes)
- UI polish / visual direction
- Whether to add a Kiro MCP integration (optional — scores "experimentation" on
  the judging rubric but isn't required for the core loop)
- Negotiation UX: real auto-negotiation logic vs. a simpler manual accept/decline
- Whether to go for the Best Startup Project bonus (confirm founder status, add
  LinkedIn + a startup site) — still unanswered from earlier, not load-bearing for
  the build itself
