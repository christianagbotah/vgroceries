"use client";

/**
 * Customer shopping assistant — deterministic, catalogue-grounded.
 * Honest demo labelling: this is rule-based matching over the demo catalogue,
 * NOT a live AI model. Answers come with evidence and suggestions that are
 * always checked against live availability before being offered.
 */

import Link from "next/link";
import { useState } from "react";
import { apiOps, ApiError, type AssistantResponse, type BudgetBasketResponse } from "@/services/client";
import { useCart } from "@/features/checkout/cart-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, parseMoneyToMinor } from "@/lib/money";
import { Sparkles, Send, ShoppingBasket, BadgeCheck, Plus, UtensilsCrossed } from "lucide-react";

const EXAMPLES = [
  "What do I need for jollof rice?",
  "Rice under 50 cedis",
  "Something for breakfast",
  "Cooking oil for frying",
  "Tomatoes for stew",
];

export default function AssistantPage() {
  const { add } = useCart();
  const { toast } = useToast();

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AssistantResponse | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [budget, setBudget] = useState("100");
  const [basket, setBasket] = useState<BudgetBasketResponse | null>(null);
  const [basketBusy, setBasketBusy] = useState(false);
  const [basketError, setBasketError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const query = q.trim();
    if (!query) return;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      setAnswer(await apiOps.assistant(query));
      setQuestion(query);
    } catch (e) {
      setAskError(e instanceof ApiError ? e.message : "The assistant could not answer — try again.");
    } finally {
      setAsking(false);
    }
  };

  const generateBasket = async () => {
    const minor = parseMoneyToMinor(budget);
    if (minor === null || minor < 100) {
      setBasketError("Enter a budget of at least ₵1.00.");
      return;
    }
    setBasketError(null);
    setBasketBusy(true);
    try {
      setBasket(await apiOps.budgetBasket(minor));
    } catch (e) {
      setBasketError(e instanceof ApiError ? e.message : "Could not build a basket.");
    } finally {
      setBasketBusy(false);
    }
  };

  const addBasketToCart = async () => {
    if (!basket) return;
    const products = await apiOps.byVariants(basket.items.map((i) => i.variantId));
    let added = 0;
    for (const item of basket.items) {
      const product = products.find((p) => p.variants.some((v) => v.id === item.variantId));
      const variant = product?.variants.find((v) => v.id === item.variantId && v.isAvailable);
      if (variant && product) {
        add({
          variantId: variant.id,
          productId: product.id,
          quantity: "1",
          name: `${product.name} — ${variant.name}`,
          image: product.image,
          priceMinor: variant.priceMinor,
        });
        added += 1;
      }
    }
    toast({ title: `Added ${added} basket item${added === 1 ? "" : "s"} to your cart` });
  };

  const addItem = async (s: { productId: string; variantId: string; label: string }) => {
    const products = await apiOps.byVariants([s.variantId]);
    const product = products.find((p) => p.variants.some((v) => v.id === s.variantId));
    const variant = product?.variants.find((v) => v.id === s.variantId && v.isAvailable);
    if (!product || !variant) {
      toast({ title: "That item just went out of stock", variant: "destructive" });
      return;
    }
    add({
      variantId: variant.id,
      productId: product.id,
      quantity: "1",
      name: `${product.name} — ${variant.name}`,
      image: product.image,
      priceMinor: variant.priceMinor,
    });
    toast({ title: "Added to cart", description: s.label });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Sparkles className="size-4" aria-hidden /> Shopping assistant
        </p>
        <h1 className="font-serif text-2xl font-bold sm:text-3xl">Ask for what you need — we&apos;ll find it</h1>
        <p className="max-w-2xl text-[15px] text-muted-foreground">
          Describe a meal, an ingredient or a budget and the assistant searches the catalogue for
          available items with live prices. Answers show exactly which products and stock facts they
          used.
        </p>
        <p className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
          <BadgeCheck className="size-3.5" aria-hidden /> Demo — deterministic catalogue matching, no live AI model is connected
        </p>
      </header>

      {/* Ask a question */}
      <section aria-labelledby="ask-heading" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 id="ask-heading" className="font-semibold">Ask the assistant</h2>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <div className="min-w-0 flex-1">
            <Label htmlFor="assistant-question" className="sr-only">Your question</Label>
            <Input
              id="assistant-question"
              className="h-12"
              placeholder="e.g. What do I need for jollof rice?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              autoComplete="off"
            />
          </div>
          <Button type="submit" size="lg" className="h-12 px-6" disabled={asking || !question.trim()}>
            <Send className="size-4" aria-hidden /> {asking ? "Thinking…" : "Ask"}
          </Button>
        </form>
        <ul className="flex flex-wrap gap-2" aria-label="Example questions">
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                className="rounded-full border bg-muted/60 px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                onClick={() => void ask(ex)}
                disabled={asking}
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>

        {asking ? <p className="text-sm text-muted-foreground" role="status">Searching the catalogue…</p> : null}
        {askError ? <ErrorState message={askError} /> : null}

        {answer ? (
          <div className="space-y-3 rounded-xl bg-muted/40 p-3 sm:p-4" role="region" aria-label="Assistant answer">
            <p className="text-[15px] leading-relaxed">{answer.answer}</p>
            {answer.evidence.length ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold">Based on:</span> {answer.evidence.join(" · ")}
              </p>
            ) : null}
            {answer.suggestions.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {answer.suggestions.map((s) => (
                  <li key={s.variantId} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                    <Link href={`/products/${s.productId}`} className="min-w-0 flex-1">
                      <span className="block truncate font-medium hover:underline focus-visible:underline">{s.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatMoney(s.priceMinor)} · {s.available} available
                      </span>
                    </Link>
                    <Button size="sm" className="h-10" onClick={() => void addItem({ productId: s.productId, variantId: s.variantId, label: s.label })}>
                      <Plus className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only sm:ml-1">Add</span>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Budget basket */}
      <section aria-labelledby="budget-heading" className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
        <h2 id="budget-heading" className="flex items-center gap-2 font-semibold">
          <UtensilsCrossed className="size-4 text-primary" aria-hidden /> Budget basket
        </h2>
        <p className="text-sm text-muted-foreground">
          Tell us your budget and the assistant fills a basket with everyday staples that fit —
          quantities and prices are always checked against live stock.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void generateBasket();
          }}
        >
          <div className="min-w-0 sm:w-44">
            <Label htmlFor="budget-input">Budget (₵)</Label>
            <Input id="budget-input" className="h-11 w-full" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
          <Button type="submit" size="lg" className="h-11" disabled={basketBusy}>
            <ShoppingBasket className="size-4" aria-hidden /> {basketBusy ? "Building…" : "Build basket"}
          </Button>
        </form>
        {basketError ? <p className="text-sm text-destructive" role="alert">{basketError}</p> : null}

        {basket ? (
          <div className="space-y-3 rounded-xl bg-muted/40 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">
                Basket for {formatMoney(basket.totalMinor)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{basket.items.length} items</span>
              </p>
              <Button size="sm" className="h-10" onClick={() => void addBasketToCart()}>
                <Plus className="size-4" aria-hidden /> Add all to cart
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{basket.note}</p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {basket.items.map((i) => (
                <li key={i.variantId} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-sm">
                  <Link href={`/products/${i.productId}`} className="min-w-0 flex-1 truncate hover:underline focus-visible:underline">
                    {i.label}
                  </Link>
                  <span className="font-medium tabular-nums">{formatMoney(i.priceMinor)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyState
            icon={ShoppingBasket}
            title="No basket built yet"
            description="Enter a budget above and the assistant will propose a basket of available staples."
          />
        )}
      </section>
    </div>
  );
}
