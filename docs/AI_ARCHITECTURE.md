# Variety Groceries — AI Architecture

**Status:** design for the production AI module. Today the frontend ships **deterministic, honestly-labelled demo implementations** of the workflows below (`src/services/mock/engine/ai.ts` — rule-based, zero model calls, zero secrets, every screen labelled Demo). This document specifies how the real module replaces those engines behind the same operations without changing screens or contracts.

---

## 1. Retained product workflows (what ships today as demo, and the production intent)

| Workflow | Today (deterministic demo) | Production module |
| --- | --- | --- |
| **Catalogue-grounded shopping assistance** (`ai.assistant`) | Keyword match over verified catalogue/stock/price records; answer + evidence + product suggestions | Retrieval-grounded LLM over the same verified records — never free generation about products |
| **Budget baskets & alternatives** (`ai.budget-basket`) | Greedy fill within budget from live prices/availability; notes constraints | Optimiser + LLM explanation; identical "best achievable basket within budget" semantics |
| **Voice/photo shopping-list entry** | Not built (labelled future capability) | Speech-to-text / photo→items on-device or via a model endpoint; output is a **draft list** the user confirms — never an auto-order |
| **Demand forecasting & replenishment suggestions** (`admin.ai.suggestions`) | Rule thresholds (sales velocity vs stock vs lead time) | Time-series forecast (queue worker) + suggestion records with evidence; explicit history window and confidence caveats |
| **Expiry alerts & reviewable promotion suggestions** | Expiry lots + markup suggestions as reviewable records | Same records, model-scored priority; promotions remain **staff-reviewed** before any price change |
| **Delivery grouping & operational exception analysis** | Dispatch grouping heuristics in reports | Batch worker analysing zones/slots/failures; outputs operational suggestions with evidence |
| **Business questions from actual records** (`admin.ai.business-question`) | Deterministic aggregations + templated answers | Tool-calling LLM restricted to the record-query tools in §4; answers must cite the queries used |
| **Unusual refund / stock-movement flags** | Seeded anomaly examples with evidence | Detection job writing flagged records with supporting evidence to the review queue |

Every workflow keeps its **evidence array** — the answer is only as good as the records it cites, and screens render evidence prominently. Insufficient data produces an explicit "not enough history to answer" response, never a confident guess.

## 2. Module shape (NestJS `ai` module)

```
ai/
├── providers/          # interchangeable model providers behind one port
│   ├── provider.port.ts       (chat/complete/embed interface + health + cost per call)
│   ├── openai.provider.ts     / anthropic.provider.ts / local.provider.ts (pluggable)
│   └── no-op.provider.ts      (default: "Not connected" — honest offline mode)
├── retrieval/          # catalogue/stock/price/operations retrieval (SQL + embeddings)
├── tools/              # permission-controlled structured tools (§4)
├── prompts/            # versioned prompt templates with evaluation fixtures
├── usage/              # per-role/user quotas, rate limits, cost ledger
├── audit/              # every AI interaction: prompt, provider, tools used, cost, outcome
└── workers/            # forecasting, anomaly detection, suggestion generation (BullMQ)
```

**Provider adapters are interchangeable** behind a port with health checks and per-call cost metadata; swapping models is configuration. **Provider secrets live only in the backend** — the frontend never sees keys (today's demo needs none). A `no-op` provider returns clearly-labelled "AI not connected" responses so the module degrades honestly.

## 3. Grounding contract (non-negotiable)

- Model inputs are assembled from **verified records**: catalogue rows, live stock/availability, current prices, order/payment/return aggregates. The model may **rephrase, rank and explain — never invent facts**.
- Retrieval runs first; the prompt carries the retrieved facts with ids. Post-generation validation re-checks any product/price/stock claim against the same records; mismatches discard the answer and log an eval failure (safety net against hallucinated prices).
- **Insufficient data is a first-class response**: e.g. forecasting states the history window it actually used ("12 weeks of sales for 48 variants; 9 variants lack history — excluded") and never claims accuracy without held-out evaluation. Today's demo already models this honesty; production keeps it.

## 4. Structured tool calls, permissions

Tools are the only way an AI flow touches records:

| Tool | Who (permission) | Mutates? |
| --- | --- | --- |
| `query_catalogue` / `query_stock` / `query_pricing` | assistant, suggestions | No |
| `query_orders` / `query_payments` / `query_refunds` / `query_delivery` | business questions (manager+) | No |
| `propose_refund_flag` / `propose_stock_adjustment` / `propose_price_change` / `propose_substitution` / `propose_purchase` | anomaly/suggestion workers | **No — writes a reviewable suggestion record only** |
| `propose_promotion` | suggestion worker | No (review queue) |

**AI never executes business mutations.** Refunds, stock adjustments, price changes, substitutions and purchasing actions flow through the *ordinary* backend validation + authorisation path after a human with the right role approves the suggestion (the `admin.ai.suggestions` review workflow the frontend already implements). This boundary is enforced structurally: tool implementations return proposal records; there is no tool that writes orders, payments, stock or refunds.

## 5. Response streaming, queued long-running work

- **Interactive assistance** streams tokens (SSE `POST /ai/assistant/stream`) with the final message carrying `evidence` and `suggestions` so the UI can render citations deterministically after the stream closes. Contracts keep the non-streaming endpoint for older clients and for tests.
- **Long-running work is queued, never request-scoped:** forecasting, anomaly detection, delivery grouping analysis and heavy business questions run as BullMQ jobs (`ai` queue) with progress state polled from a job record. Timeouts are explicit; partial results are labelled partial.
- Usage limits: per-user daily quotas + per-role concurrency caps enforced at the module boundary; exceeding returns a clear 429-shaped response, not silence.

## 6. Cost tracking, evaluation, audit

- **Cost ledger:** every provider call logs tokens in/out, model, purpose (workflow id), cost estimate; per-workflow and per-day aggregation feeds the admin usage screen and budget alerts.
- **Evaluation:** prompt templates are versioned with fixture sets (grounded QA pairs over seeded catalogue data); CI runs cheap deterministic checks (evidence present, no invented products, JSON shape) on every template change; periodic offline eval with held-out questions scores groundedness (are cited facts real?) — reported with the eval date and sample size, no invented accuracy claims.
- **Audit history:** every AI interaction is persisted (prompt hash, provider, tools invoked, retrieved record ids, response, cost, latency, user) — the admin audit surface already exists; AI events are first-class rows. Suggestion review decisions record who approved what, linking to the business action that followed.

## 7. Demo/labelling rules enforced during this handoff

- All AI features remain deterministic demos labelled **Demo** / **Not connected** (the settings + AI screens already do this; `docs/KNOWN_ISSUES.md` records the boundary).
- No provider secrets in the repo; no network model calls anywhere in the frontend.
- Forecasting-adjacent suggestions identify the data window they used and carry no accuracy claims.

When the backend module lands, the screens' labels switch from Demo to live by configuration — no contract change.
