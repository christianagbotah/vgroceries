"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import type { GhanaAssistantLanguage, GhanaMealPlanResponse } from "@/services/contracts";
import { useCart } from "@/features/checkout/cart-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/shared/states";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/lib/money";
import { Check, Mic, MicOff, Minus, Plus, ShoppingCart, Sparkles, Trash2, UtensilsCrossed } from "lucide-react";

const EXAMPLES = [
  "Today I want yam ampesi with kontomire, kobi and nkosua for 3 people.",
  "I want fufu with aponchi nam and light soup for a family of four.",
  "Fufu with groundnut soup and cow meat for 2 people.",
  "I need sabala, kokloji, tomatoes and pepper.",
];

const LANGUAGE_OPTIONS: { value: GhanaAssistantLanguage; label: string; speech: string }[] = [
  { value: "auto", label: "Auto detect", speech: "en-GH" },
  { value: "twi", label: "Twi", speech: "tw-GH" },
  { value: "ga", label: "Ga", speech: "gaa-GH" },
  { value: "ewe", label: "Ewe", speech: "ee-GH" },
  { value: "english", label: "English", speech: "en-GH" },
];

type SpeechRecognitionEventLike = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionErrorLike = { error?: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function positiveQuantity(value: string) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export default function AssistantPage() {
  const { add } = useCart();
  const { toast } = useToast();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState<GhanaAssistantLanguage>("auto");
  const [servings, setServings] = useState("1");
  const [plan, setPlan] = useState<GhanaMealPlanResponse | null>(null);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [speechMessage, setSpeechMessage] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const editedSubtotal = useMemo(() => {
    if (!plan) return 0;
    return plan.lines.reduce((sum, line) => sum + Math.round(line.unitPriceMinor * positiveQuantity(quantities[line.variantId] ?? line.quantity)), 0);
  }, [plan, quantities]);

  const setQty = (variantId: string, value: string) => {
    if (value !== "" && !/^\d{0,4}(?:\.\d{0,3})?$/.test(value)) return;
    setQuantities((current) => ({ ...current, [variantId]: value }));
  };

  const ask = async (text = question) => {
    const query = text.trim();
    if (!query) return;
    setAsking(true);
    setAskError(null);
    try {
      const requestedServings = Number(servings);
      const response = await apiOps.mealPlan({
        text: query,
        language,
        ...(Number.isInteger(requestedServings) && requestedServings >= 1 && requestedServings <= 20 ? { servings: requestedServings } : {}),
      });
      setPlan(response);
      setQuestion(query);
      setServings(String(response.servings));
      setQuantities(Object.fromEntries(response.lines.map((line) => [line.variantId, line.quantity])));
    } catch (error) {
      setAskError(error instanceof ApiError ? error.message : "I could not build that market list. Try describing the meal again.");
    } finally {
      setAsking(false);
    }
  };

  const startVoice = () => {
    setSpeechMessage(null);
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechMessage("Voice input is not supported by this browser. You can type the same request instead.");
      return;
    }
    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = LANGUAGE_OPTIONS.find((item) => item.value === language)?.speech ?? "en-GH";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join(" ").trim();
      if (transcript) setQuestion((current) => current ? `${current} ${transcript}` : transcript);
    };
    recognition.onerror = (event) => {
      setSpeechMessage(event.error === "not-allowed"
        ? "Microphone permission was not granted. You can still type your request."
        : "I could not hear that clearly. Try again or type your request.");
    };
    recognition.onend = () => setListening(false);
    setListening(true);
    recognition.start();
  };

  const stopVoice = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const removeLine = (variantId: string) => setQty(variantId, "0");

  const addAvailableToCart = async () => {
    if (!plan) return;
    const selected = plan.lines.filter((line) => positiveQuantity(quantities[line.variantId] ?? line.quantity) > 0);
    if (!selected.length) return;
    setAdding(true);
    try {
      const latestProducts = await apiOps.byVariants(selected.map((line) => line.variantId));
      let added = 0;
      let skipped = 0;
      for (const line of selected) {
        const requested = quantities[line.variantId] ?? line.quantity;
        const product = latestProducts.find((item) => item.id === line.productId && item.variants.some((variant) => variant.id === line.variantId));
        const variant = product?.variants.find((item) => item.id === line.variantId && item.isAvailable);
        if (!product || !variant || Number(variant.availableToSell) < positiveQuantity(requested)) {
          skipped += 1;
          continue;
        }
        add({
          variantId: variant.id,
          productId: product.id,
          quantity: requested,
          name: `${product.name} — ${variant.name}`,
          image: product.image,
          priceMinor: variant.priceMinor,
        });
        added += 1;
      }
      toast({
        title: `Added ${added} ${added === 1 ? "item" : "items"} to your cart`,
        description: skipped ? `${skipped} item${skipped === 1 ? " was" : "s were"} skipped because current stock was no longer enough.` : "Prices and stock were checked again before adding.",
      });
    } catch (error) {
      toast({ title: "Could not refresh the market list", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <header className="rounded-3xl border bg-card p-5 sm:p-7">
        <p className="flex items-center gap-2 text-sm font-semibold text-primary"><Sparkles className="size-4" aria-hidden /> Ghana shopping assistant</p>
        <h1 className="mt-2 font-serif text-2xl font-bold sm:text-4xl">Say the meal. Get the market list.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Speak or type naturally in Twi, Ga, Ewe or English. Tell us what you want to eat and how many people are eating; the assistant matches the request to groceries that are actually in the Variety Groceries catalogue and builds an editable budget.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="meal-request-heading">
        <div>
          <h2 id="meal-request-heading" className="font-semibold">What would you like to prepare?</h2>
          <p className="mt-1 text-xs text-muted-foreground">Choose a language for better microphone recognition, or leave it on auto for typed requests and code-switching.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_120px]">
          <div>
            <Label htmlFor="meal-language">Language</Label>
            <select id="meal-language" value={language} onChange={(event) => setLanguage(event.target.value as GhanaAssistantLanguage)} className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-sm">
              {LANGUAGE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <Label htmlFor="meal-servings">People eating</Label>
            <Input id="meal-servings" inputMode="numeric" type="number" min={1} max={20} value={servings} onChange={(event) => setServings(event.target.value)} className="mt-1 h-11" />
          </div>
        </div>

        <div>
          <Label htmlFor="meal-question">Your meal or market request</Label>
          <textarea
            id="meal-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Example: Today I want yam ampesi with kontomire, kobi and nkosua. We are three."
            className="mt-1 min-h-28 w-full resize-y rounded-xl border bg-background px-3 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={listening ? stopVoice : startVoice}>
            {listening ? <MicOff className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
            {listening ? "Stop listening" : "Speak"}
          </Button>
          <Button type="button" className="h-11" onClick={() => void ask()} disabled={asking || !question.trim()}>
            <Sparkles className="size-4" aria-hidden /> {asking ? "Building your market list…" : "Build my market list"}
          </Button>
        </div>
        {speechMessage ? <p role="status" className="text-xs text-muted-foreground">{speechMessage}</p> : null}
        {askError ? <ErrorState message={askError} /> : null}

        <div className="flex flex-wrap gap-2" aria-label="Example meal requests">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" onClick={() => { setQuestion(example); void ask(example); }} disabled={asking} className="rounded-full border bg-muted/40 px-3 py-1.5 text-left text-xs hover:bg-accent disabled:opacity-50">
              {example}
            </button>
          ))}
        </div>
      </section>

      {plan ? (
        <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6" aria-labelledby="market-list-heading">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{plan.detectedLanguage} · {plan.servings} {plan.servings === 1 ? "person" : "people"}</p>
              <h2 id="market-list-heading" className="mt-1 text-xl font-bold">{plan.dishLabel ?? "Your market list"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.summary}</p>
            </div>
            <div className="rounded-xl bg-muted px-3 py-2 text-right">
              <p className="text-xs text-muted-foreground">Estimated total</p>
              <p className="text-xl font-bold tabular-nums">{formatMoney(editedSubtotal)}</p>
            </div>
          </div>

          <ul className="space-y-2">
            {plan.lines.map((line) => {
              const qty = quantities[line.variantId] ?? line.quantity;
              const removed = positiveQuantity(qty) === 0;
              return (
                <li key={line.variantId} className={`grid gap-3 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_150px_120px] sm:items-center ${removed ? "opacity-50" : ""}`}>
                  <div className="min-w-0">
                    <p className="font-semibold">{line.conceptLabel}</p>
                    <p className="truncate text-sm text-muted-foreground">{line.productName} · {line.variantName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatMoney(line.unitPriceMinor)} per {line.unitSize || line.unit} · {line.availableToSell} available</p>
                    {line.note ? <p className="mt-1 text-xs text-amber-700">{line.note}</p> : null}
                  </div>
                  <div>
                    <Label htmlFor={`qty-${line.variantId}`} className="text-xs">Quantity</Label>
                    <div className="mt-1 flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setQty(line.variantId, String(Math.max(0, positiveQuantity(qty) - 1)))} aria-label={`Reduce ${line.conceptLabel}`}><Minus className="size-3" /></Button>
                      <Input id={`qty-${line.variantId}`} inputMode="decimal" value={qty} onChange={(event) => setQty(line.variantId, event.target.value)} className="h-9 min-w-0 text-center" />
                      <Button type="button" variant="outline" size="icon" className="size-9" onClick={() => setQty(line.variantId, String(positiveQuantity(qty) + 1))} aria-label={`Add more ${line.conceptLabel}`}><Plus className="size-3" /></Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:justify-end">
                    <span className="font-semibold tabular-nums">{formatMoney(Math.round(line.unitPriceMinor * positiveQuantity(qty)))}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(line.variantId)} aria-label={`Remove ${line.conceptLabel}`}><Trash2 className="size-4" /></Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {plan.unresolved.length ? (
            <div className="rounded-xl border border-dashed p-3">
              <p className="text-sm font-semibold">Still needed / not matched</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {plan.unresolved.map((item, index) => <li key={`${item.term}-${index}`}>{item.term} — {item.reason.replaceAll("_", " ")}</li>)}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center">
            <div className="text-xs text-muted-foreground">
              <p className="flex items-center gap-1"><Check className="size-3.5 text-primary" /> Live catalogue prices and stock are checked again before cart handoff.</p>
              <p className="mt-1">Cooking quantities are estimates; change or remove anything before you continue.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-11" onClick={() => void addAvailableToCart()} disabled={adding || !plan.lines.length}>
                <ShoppingCart className="size-4" /> {adding ? "Checking stock…" : "Add available items to cart"}
              </Button>
              <Button asChild variant="outline" className="h-11"><Link href="/checkout">Go to checkout</Link></Button>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed bg-muted/20 p-6 text-center">
          <UtensilsCrossed className="mx-auto size-8 text-primary" aria-hidden />
          <h2 className="mt-3 font-semibold">Your market list will appear here</h2>
          <p className="mt-1 text-sm text-muted-foreground">Try “fufu with groundnut soup for four” or use the microphone and say it the way you normally would.</p>
        </section>
      )}
    </div>
  );
}
