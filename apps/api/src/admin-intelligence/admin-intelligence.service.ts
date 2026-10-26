import { Inject, Injectable, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { BusinessQuestionResponse, DashboardView, GhanaCatalogueCoverageResponse, SuggestionRow } from "@variety/contracts";
import { API_CONFIG, type ApiConfig } from "../config";
import { Database } from "../database/database";
import { ApiProblem } from "../http/errors";
import { CatalogService } from "../catalog/catalog.service";
import { ghanaMealCatalogueCoverage, ghanaMealCatalogueGaps } from "../ai/ghana-catalogue-match";

const PAID_STATUSES = ["succeeded", "partially_refunded", "refunded"];
const AI_REVIEW_ACTION = "ai_suggestion_review";
const AI_GENERATE_ACTION = "ai_suggestions_generated";
const money = (minor: number) => `₵${(minor / 100).toFixed(2)}`;
const labelTime = (date: Date) => date.toISOString().slice(0, 16).replace("T", " ");
const stableId = (kind: string, key: string) => `ai_${createHash("sha256").update(`${kind}|${key}`).digest("hex").slice(0, 20)}`;

type AvailabilityRow = {
  variantId: string;
  variantName: string;
  productName: string;
  availableToSell: Prisma.Decimal;
};

type TopProductRow = {
  name: string;
  variant: string;
  qty: Prisma.Decimal;
  revenueMinor: bigint | number;
};

@Injectable()
export class AdminIntelligenceService {
  private readonly logger = new Logger(AdminIntelligenceService.name);
  private openAiClient?: OpenAI;

  constructor(
    private readonly db: Database,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly catalog: CatalogService,
  ) {}

  private async availabilityRows() {
    return this.db.$queryRaw<AvailabilityRow[]>`
      SELECT v.id AS "variantId", v.name AS "variantName", p.name AS "productName", a."availableToSell"
      FROM variant_availability a
      JOIN "Variant" v ON v.id=a."variantId"
      JOIN "Product" p ON p.id=v."productId"
      WHERE a."locationId"=${this.config.stockLocationId} AND v.active AND p.published
      ORDER BY a."availableToSell" ASC, p.name ASC, v.name ASC
    `;
  }


  private async purchasableCatalogue() {
    const first = await this.catalog.list({ q: "", page: 1, perPage: 100, sort: "name" });
    const items = [...first.items];
    for (let page = 2; page <= first.pages; page++) {
      const next = await this.catalog.list({ q: "", page, perPage: 100, sort: "name" });
      items.push(...next.items);
    }
    return items;
  }

  private async reports(): Promise<DashboardView["reports"]> {
    const now = new Date();
    const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 13));
    const orders = await this.db.order.findMany({
      where: { createdAt: { gte: firstDay } },
      select: { createdAt: true, channel: true, totalMinor: true, paymentStatus: true, fulfilmentStatus: true },
    });
    const salesByDay: DashboardView["reports"]["salesByDay"] = [];
    const rows = new Map<string, DashboardView["reports"]["salesByDay"][number]>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const date = d.toISOString().slice(0, 10);
      const row = { date, onlineMinor: 0, posMinor: 0, orders: 0 };
      salesByDay.push(row);
      rows.set(date, row);
    }
    for (const order of orders) {
      if (order.fulfilmentStatus === "cancelled") continue;
      const row = rows.get(order.createdAt.toISOString().slice(0, 10));
      if (!row) continue;
      row.orders += 1;
      if (!PAID_STATUSES.includes(order.paymentStatus)) continue;
      if (order.channel === "online") row.onlineMinor += order.totalMinor;
      else row.posMinor += order.totalMinor;
    }

    const topProducts = await this.db.$queryRaw<TopProductRow[]>`
      SELECT ol."productName" AS name, ol."variantName" AS variant,
             SUM(ol.quantity) AS qty, SUM(ol."lineTotalMinor") AS "revenueMinor"
      FROM "OrderLine" ol
      JOIN "Order" o ON o.id=ol."orderId"
      WHERE o."fulfilmentStatus" <> 'cancelled'
        AND o."paymentStatus" IN ('succeeded','partially_refunded','refunded')
      GROUP BY ol."productName", ol."variantName"
      ORDER BY SUM(ol."lineTotalMinor") DESC
      LIMIT 10
    `;
    const fulfilment = await this.db.order.groupBy({ by: ["fulfilmentStatus"], _count: { _all: true } });
    const delivery = await this.db.deliveryJob.groupBy({ by: ["status"], _count: { _all: true } });
    const refundSum = await this.db.refund.aggregate({ where: { status: "succeeded" }, _sum: { amountMinor: true } });
    const payments = await this.db.paymentAttempt.groupBy({ by: ["settlementState"], _count: { _all: true } });
    const availability = await this.availabilityRows();
    const sellableUnits = availability.reduce((sum, row) => sum + Math.max(0, Number(row.availableToSell)), 0);
    const zeroVariants = availability.filter((row) => Number(row.availableToSell) <= 0).length;
    const lowVariants = availability.filter((row) => Number(row.availableToSell) > 0 && Number(row.availableToSell) <= 3).length;
    const costRows = await this.db.stockLot.findMany({
      where: {
        kind: "regular", quarantined: false, quantity: { gt: 0 },
        position: { locationId: this.config.stockLocationId },
      },
      select: { quantity: true, unitCostMinor: true },
    });
    const costBasisMinor = costRows.reduce((sum, lot) => sum + Math.round(Number(lot.quantity) * (lot.unitCostMinor ?? 0)), 0);
    const paymentCount = (state: string) => payments.find((row) => row.settlementState === state)?._count._all ?? 0;

    return {
      salesByDay,
      topProducts: topProducts.map((row) => ({
        name: row.name, variant: row.variant, qty: Number(row.qty), revenueMinor: Number(row.revenueMinor),
      })),
      fulfilmentCounts: Object.fromEntries(fulfilment.map((row) => [row.fulfilmentStatus, row._count._all])),
      deliveryCounts: Object.fromEntries(delivery.map((row) => [row.status, row._count._all])),
      returnsSummary: { total: 0, pending: 0, resolved: 0, refundedMinor: refundSum._sum.amountMinor ?? 0 },
      cashSummary: { openSessions: 0, expectedMinor: 0, lastClosedDiffMinor: 0 },
      stockValue: { costBasisMinor, sellableUnits, zeroVariants, lowVariants },
      paymentsReconciliation: {
        settled: paymentCount("settled") + paymentCount("reconciled"),
        unsettled: paymentCount("unsettled"),
        exceptions: paymentCount("exception"),
      },
    };
  }

  async dashboard(): Promise<DashboardView> {
    const reports = await this.reports();
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const start = new Date(`${today}T00:00:00.000Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const expiringEnd = new Date(now.getTime() + 7 * 86_400_000);
    const [
      awaitingConfirmation, readyToPick, picking, readyToDispatch, pendingPayments,
      refundsAttention, expiringSoon, unassignedJobs, recentOrders,
    ] = await Promise.all([
      this.db.order.count({ where: { fulfilmentStatus: "awaiting_confirmation", channel: "online" } }),
      this.db.order.count({ where: { fulfilmentStatus: "confirmed" } }),
      this.db.order.count({ where: { fulfilmentStatus: "picking" } }),
      this.db.order.count({ where: { fulfilmentStatus: "packed", fulfilment: "delivery" } }),
      this.db.order.count({ where: { paymentStatus: { in: ["pending", "requires_review"] } } }),
      this.db.refund.count({ where: { status: { in: ["awaiting_approval", "requires_review"] } } }),
      this.db.stockLot.count({ where: {
        kind: "regular", quarantined: false, quantity: { gt: 0 }, expiryDate: { gte: now, lte: expiringEnd },
        position: { locationId: this.config.stockLocationId },
      } }),
      this.db.deliveryJob.count({ where: { status: { in: ["unassigned", "rescheduled"] } } }),
      this.db.order.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);
    const todayRow = reports.salesByDay.find((row) => row.date === today) ?? { date: today, onlineMinor: 0, posMinor: 0, orders: 0 };
    // Keep the exact UTC-day boundary explicit even if there are no rows yet.
    void start; void end;
    return {
      today: todayRow,
      actionable: {
        awaitingConfirmation, readyToPick, picking, readyToDispatch, pendingPayments,
        returnsPending: 0,
        refundsAttention,
        lowStock: reports.stockValue.lowVariants,
        expiringSoon,
        unassignedJobs,
        openSessions: 0,
      },
      recentOrders: recentOrders.map((order) => ({
        id: order.id,
        reference: order.reference,
        customer: order.customerName,
        channel: order.channel,
        total: order.totalMinor,
        paymentStatus: order.paymentStatus,
        fulfilmentStatus: order.fulfilmentStatus,
        at: order.createdAt.toISOString(),
        atLabel: labelTime(order.createdAt),
        totalLabel: money(order.totalMinor),
      })),
      reports,
    };
  }

  private async generatedSuggestions(): Promise<SuggestionRow[]> {
    const createdAt = new Date();
    const suggestions: SuggestionRow[] = [];
    const availability = await this.availabilityRows();
    for (const row of availability.filter((item) => Number(item.availableToSell) <= 3).slice(0, 12)) {
      const available = Number(row.availableToSell);
      const key = row.variantId;
      suggestions.push({
        id: stableId("replenishment", key),
        kind: "replenishment",
        title: `${row.productName} (${row.variantName}) needs stock attention`,
        detail: `${row.availableToSell.toString()} sellable units remain at the active commerce location. Review purchasing before the item becomes unavailable; no purchase order is sent automatically.`,
        evidence: [`Available to sell: ${row.availableToSell.toString()}`, `Variant: ${row.variantId}`, `Stock location: ${this.config.stockLocationId}`],
        dataPeriod: "Current live inventory availability",
        status: "suggested",
        requiresRole: ["owner_admin", "operations_manager", "inventory_officer"],
        createdAt: createdAt.toISOString(),
        createdAtLabel: labelTime(createdAt),
        source: "deterministic_demo",
        proposedAction: "Open Inventory/Purchasing and review replenishment quantity before creating any supplier order.",
      });
    }


    const catalogueGaps = ghanaMealCatalogueGaps(await this.purchasableCatalogue());
    for (const gap of catalogueGaps) {
      suggestions.push({
        id: stableId("ghana_catalogue_gap", gap.conceptId),
        kind: "operations_explanation",
        title: `${gap.label} is a Ghana meal catalogue coverage gap`,
        detail: `No currently purchasable published catalogue product safely matches ${gap.label}. This ingredient is required by ${gap.mealLabels.join(", ")}. No product, price or stock record is created automatically.`,
        evidence: [
          `Ingredient: ${gap.label} (${gap.conceptId})`,
          `Required by: ${gap.mealLabels.join(", ")}`,
          `Catalogue basis: live published products with sellable stock at ${this.config.stockLocationId}`,
        ],
        dataPeriod: "Current live catalogue + deterministic Ghana meal templates",
        status: "suggested",
        requiresRole: ["owner_admin", "operations_manager", "inventory_officer"],
        createdAt: createdAt.toISOString(),
        createdAtLabel: labelTime(createdAt),
        source: "deterministic_demo",
        proposedAction: `Review sourcing for ${gap.label}; create or publish a catalogue product only after unit, price and physical stock are verified.`,
      });
    }

    const expiring = await this.db.stockLot.findMany({
      where: {
        kind: "regular", quarantined: false, quantity: { gt: 0 },
        expiryDate: { gte: createdAt, lte: new Date(createdAt.getTime() + 7 * 86_400_000) },
        position: { locationId: this.config.stockLocationId },
      },
      include: { position: { include: { variant: { include: { product: true } } } } },
      orderBy: { expiryDate: "asc" },
      take: 12,
    });
    for (const lot of expiring) {
      const variant = lot.position.variant;
      suggestions.push({
        id: stableId("expiry_promotion", lot.id), kind: "expiry_promotion",
        title: `${variant.product.name} lot ${lot.lotNumber} expires soon`,
        detail: `${lot.quantity.toString()} ${variant.unit} remain in this lot. Review a markdown, transfer or other approved action; nothing is repriced automatically.`,
        evidence: [`Expiry: ${lot.expiryDate?.toISOString().slice(0, 10)}`, `Quantity: ${lot.quantity.toString()} ${variant.unit}`, `Current price: ${money(variant.priceMinor)}`],
        dataPeriod: "Current live lot data", status: "suggested",
        requiresRole: ["owner_admin", "operations_manager", "inventory_officer"],
        createdAt: createdAt.toISOString(), createdAtLabel: labelTime(createdAt), source: "deterministic_demo",
        proposedAction: "Open the product/inventory record and review a human-approved expiry action.",
      });
    }

    const pendingAttempts = await this.db.paymentAttempt.findMany({
      where: { status: { in: ["initiated", "pending"] } }, include: { order: true }, orderBy: { createdAt: "asc" }, take: 12,
    });
    for (const attempt of pendingAttempts) {
      suggestions.push({
        id: stableId("operations_explanation", attempt.id), kind: "operations_explanation",
        title: `Payment pending on ${attempt.order.reference}`,
        detail: `Payment attempt ${attempt.id} for ${money(attempt.amountMinor)} is still ${attempt.status}. Do not ask the customer to pay again until provider authority is reconciled.`,
        evidence: [`Attempt status: ${attempt.status}`, `Settlement: ${attempt.settlementState}`, `Callback count: ${attempt.callbackCount}`],
        dataPeriod: "Current live payment authority", status: "suggested",
        requiresRole: ["owner_admin", "operations_manager", "finance_reviewer"],
        createdAt: createdAt.toISOString(), createdAtLabel: labelTime(createdAt), source: "deterministic_demo",
        proposedAction: "Open Payments and reconcile the provider outcome before any re-charge or refund decision.",
      });
    }

    const reviewOrders = await this.db.order.findMany({ where: { paymentStatus: "requires_review" }, orderBy: { createdAt: "asc" }, take: 12 });
    for (const order of reviewOrders) {
      suggestions.push({
        id: stableId("exception_flag", order.id), kind: "exception_flag",
        title: `${order.reference} requires payment/fulfilment review`,
        detail: "Verified money or stock timing created an exception that must be resolved by staff. No automatic fulfilment or refund decision is made.",
        evidence: [`Payment: ${order.paymentStatus}`, `Fulfilment: ${order.fulfilmentStatus}`, `Order total: ${money(order.totalMinor)}`],
        dataPeriod: "Current live order authority", status: "suggested",
        requiresRole: ["owner_admin", "operations_manager", "finance_reviewer"],
        createdAt: createdAt.toISOString(), createdAtLabel: labelTime(createdAt), source: "deterministic_demo",
        proposedAction: "Open the order and choose the authorized fulfil-or-refund workflow after reviewing stock and payment evidence.",
      });
    }

    const ids = suggestions.map((item) => item.id);
    if (ids.length) {
      const reviews = await this.db.auditEvent.findMany({
        where: { action: AI_REVIEW_ACTION, entityId: { in: ids } }, orderBy: { createdAt: "desc" },
      });
      const status = new Map<string, "reviewed" | "dismissed">();
      for (const event of reviews) {
        if (status.has(event.entityId)) continue;
        const details = event.details as Record<string, unknown>;
        if (details.decision === "reviewed" || details.decision === "dismissed") status.set(event.entityId, details.decision);
      }
      for (const suggestion of suggestions) suggestion.status = status.get(suggestion.id) ?? "suggested";
    }
    return suggestions;
  }

  async suggestions() {
    return this.generatedSuggestions();
  }

  async ghanaCatalogueCoverage(): Promise<GhanaCatalogueCoverageResponse> {
    const rows = ghanaMealCatalogueCoverage(await this.catalog.publishedForAnalysis());
    return {
      rows,
      summary: {
        total: rows.length,
        available: rows.filter((row) => row.status === "available").length,
        outOfStock: rows.filter((row) => row.status === "out_of_stock").length,
        wrongFormOnly: rows.filter((row) => row.status === "wrong_form_only").length,
        missing: rows.filter((row) => row.status === "missing").length,
      },
    };
  }

  async generate(actorId: string, requestId: string) {
    const suggestions = await this.generatedSuggestions();
    await this.db.auditEvent.create({ data: {
      actorId, action: AI_GENERATE_ACTION, entityId: "admin-ai", requestId,
      details: { generated: suggestions.length, source: "live_authority_rules" },
    } });
    return { generated: suggestions.length };
  }

  async review(actorId: string, requestId: string, suggestionId: string, decision: "reviewed" | "dismissed") {
    const suggestion = (await this.generatedSuggestions()).find((item) => item.id === suggestionId);
    if (!suggestion) throw new ApiProblem(404, "NOT_FOUND", "Suggestion not found or no longer applies to current authority data.");
    await this.db.auditEvent.create({ data: {
      actorId, action: AI_REVIEW_ACTION, entityId: suggestionId, requestId,
      details: { decision, kind: suggestion.kind, title: suggestion.title },
    } });
    return { status: decision };
  }

  private async groundedQuestion(question: string): Promise<BusinessQuestionResponse> {
    const q = question.trim().toLowerCase();
    if (!q) throw new ApiProblem(400, "VALIDATION_FAILED", "Enter a business question.");
    const dashboard = await this.dashboard();
    const availability = await this.availabilityRows();
    const low = availability.filter((row) => Number(row.availableToSell) <= 3);

    if (/sale|revenue|turnover|today|order value/.test(q)) {
      return {
        answer: `Confirmed sales today are ${money(dashboard.today.onlineMinor + dashboard.today.posMinor)} across ${dashboard.today.orders} recorded orders. Online and non-online channels remain separated in the dashboard.`,
        evidence: [`Online: ${money(dashboard.today.onlineMinor)}`, `Other/POS: ${money(dashboard.today.posMinor)}`, `Recorded orders today: ${dashboard.today.orders}`],
      };
    }
    if (/stock|low|replenish|inventory|run out/.test(q)) {
      return {
        answer: `${low.length} published variants are at or below 3 sellable units at the active commerce location. Review the listed evidence before replenishment.`,
        evidence: low.slice(0, 8).map((row) => `${row.productName} — ${row.variantName}: ${row.availableToSell.toString()} available`),
      };
    }
    if (/deliver|dispatch|rider|courier/.test(q)) {
      const active = await this.db.deliveryJob.findMany({ where: { status: { notIn: ["delivered", "return_to_store"] } }, include: { order: true }, orderBy: { updatedAt: "desc" }, take: 8 });
      return {
        answer: `${active.length} recent delivery jobs are still active in the current bounded view. Dispatch remains the authority for assignment and delivery transitions.`,
        evidence: active.map((job) => `${job.order.reference}: ${job.status} / ${job.custodyState}`),
      };
    }
    if (/payment|refund|money|settlement/.test(q)) {
      return {
        answer: `${dashboard.actionable.pendingPayments} orders need payment attention and ${dashboard.actionable.refundsAttention} refunds need approval/review. Provider evidence remains authoritative for money state.`,
        evidence: [
          `Pending/review orders: ${dashboard.actionable.pendingPayments}`,
          `Refunds needing attention: ${dashboard.actionable.refundsAttention}`,
          `Settlement exceptions: ${dashboard.reports.paymentsReconciliation.exceptions}`,
        ],
      };
    }
    return {
      answer: "I can currently answer live-data questions about sales, stock, payments/refunds and dispatch. The evidence below comes from server authority data; no operational change is executed from this answer.",
      evidence: [
        `Today's recorded orders: ${dashboard.today.orders}`,
        `Low-stock variants: ${dashboard.actionable.lowStock}`,
        `Pending payments: ${dashboard.actionable.pendingPayments}`,
        `Unassigned/rescheduled jobs: ${dashboard.actionable.unassignedJobs}`,
      ],
    };
  }

  private async modelAnswer(question: string, grounded: BusinessQuestionResponse) {
    const assistant = this.config.assistantAi;
    if (!assistant) return null;
    this.openAiClient ??= new OpenAI({ apiKey: assistant.openAiApiKey, timeout: assistant.timeoutMs, maxRetries: 1 });
    const schema = z.object({ answer: z.string().min(1).max(1200) });
    try {
      const response = await this.openAiClient.responses.parse({
        model: assistant.model,
        input: [
          { role: "system", content: "You are the Variety Groceries operations copilot. Answer only from the evidence supplied by the server. Do not invent sales, stock, payment, delivery, customer or supplier facts. Do not execute or claim to execute any action. If evidence is insufficient, say so. Keep the answer practical and concise." },
          { role: "user", content: `Question: ${question}\n\nServer evidence:\n${grounded.evidence.map((line) => `- ${line}`).join("\n")}\n\nDeterministic summary: ${grounded.answer}` },
        ],
        text: { format: zodTextFormat(schema, "variety_admin_business_answer") },
      });
      return response.output_parsed?.answer ?? null;
    } catch (error) {
      this.logger.warn(`Admin AI model answer failed; using authority-grounded fallback. ${error instanceof Error ? error.message : "Unknown model error"}`);
      return null;
    }
  }

  async businessQuestion(question: string): Promise<BusinessQuestionResponse> {
    const grounded = await this.groundedQuestion(question);
    const answer = await this.modelAnswer(question, grounded);
    return answer ? { answer, evidence: grounded.evidence } : grounded;
  }
}
