"use client";

import { useState } from "react";
import { apiOps, ApiError } from "@/services/client";
import { useApiData } from "@/features/staff/admin-data";
import { useStaff } from "@/features/staff/role-context";
import { LoadingState, ErrorState, EmptyState } from "@/components/shared/states";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, RefreshCw, WandSparkles, MessageCircleQuestion, Check, X } from "lucide-react";
import type { AISuggestion } from "@/types/domain";

const KIND_LABELS: Record<AISuggestion["kind"], string> = {
  shopping_answer: "Shopping answers",
  budget_basket: "Budget basket",
  alternative: "Alternatives",
  replenishment: "Replenishment",
  expiry_promotion: "Expiry review",
  dispatch_grouping: "Dispatch grouping",
  operations_explanation: "Operations explanations",
  business_answer: "Business questions",
  exception_flag: "Exception flags",
};

export default function AdminAiPage() {
  const { user, can } = useStaff();
  const { toast } = useToast();
  const { data, loading, error, reload } = useApiData(() => apiOps.aiSuggestions(), []);
  const [generating, setGenerating] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ answer: string; evidence: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [tab, setTab] = useState("suggestions");

  const generate = async () => {
    setGenerating(true);
    try {
      const r = await apiOps.aiGenerate();
      await reload();
      toast({ title: `${r.generated} suggestion(s) generated`, description: "Deterministic rules over live demo data — no model connected." });
    } catch (e) {
      toast({ title: "Generation failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const ask = async () => {
    if (!question.trim()) return;
    setAsking(true);
    try {
      setAnswer(await apiOps.aiBusinessQuestion(question.trim()));
    } catch (e) {
      setAnswer({ answer: e instanceof ApiError ? e.message : "The question could not be answered.", evidence: [] });
    } finally {
      setAsking(false);
    }
  };

  const review = async (id: string, decision: "reviewed" | "dismissed") => {
    try {
      await apiOps.aiReview(id, decision);
      await reload();
      toast({ title: decision === "reviewed" ? "Marked reviewed" : "Dismissed" });
    } catch (e) {
      toast({ title: "Action failed", description: e instanceof ApiError ? e.message : undefined, variant: "destructive" });
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading suggestions" />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const suggestions = (data ?? []).filter((s) => s.status === "suggested");
  const reviewed = (data ?? []).filter((s) => s.status !== "suggested");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="font-serif text-2xl font-bold">AI assistant</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic, clearly labelled demo suggestions with evidence and data period. No live
            model is connected — nothing sensitive executes automatically.
          </p>
        </div>
        {can("ai.view") ? (
          <Button className="h-10" onClick={generate} disabled={generating}>
            <WandSparkles className="size-4" aria-hidden /> {generating ? "Generating…" : "Refresh suggestions"}
          </Button>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-12 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="suggestions" className="gap-1.5 px-4"><Sparkles className="size-4" aria-hidden /> Suggestions ({suggestions.length})</TabsTrigger>
          <TabsTrigger value="reviewed" className="gap-1.5 px-4"><Check className="size-4" aria-hidden /> Reviewed ({reviewed.length})</TabsTrigger>
          <TabsTrigger value="ask" className="gap-1.5 px-4"><MessageCircleQuestion className="size-4" aria-hidden /> Ask a question</TabsTrigger>
        </TabsList>

        <TabsContent value="suggestions" className="mt-4 space-y-3">
          {!suggestions.length ? (
            <EmptyState icon={Sparkles} title="No open suggestions" description="Refresh to generate from current demo data." action={{ label: "Refresh now", onClick: generate }} />
          ) : (
            suggestions.map((s) => <SuggestionCard key={s.id} s={s} onReview={review} canReview={can("ai.view")} />)
          )}
        </TabsContent>

        <TabsContent value="reviewed" className="mt-4 space-y-3">
          {!reviewed.length ? (
            <EmptyState icon={Check} title="Nothing reviewed yet" description="Reviewed and dismissed suggestions are kept for history." />
          ) : (
            reviewed.map((s) => <SuggestionCard key={s.id} s={s} onReview={review} canReview={false} />)
          )}
        </TabsContent>

        <TabsContent value="ask" className="mt-4 space-y-3">
          <div className="space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-semibold">Business question</h2>
            <p className="text-sm text-muted-foreground">
              Answers come from recorded demo events only — sales, stock and delivery state. Ask
              about today&apos;s sales, low stock or delivery status.
            </p>
            <form
              className="flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask();
              }}
            >
              <Input className="h-11 min-w-52 flex-1" placeholder="e.g. How were today's sales?" value={question} onChange={(e) => setQuestion(e.target.value)} aria-label="Business question" />
              <Button type="submit" className="h-11" disabled={asking || !question.trim()}>
                {asking ? "Thinking…" : "Ask"}
              </Button>
            </form>
            {answer ? (
              <div className="space-y-2 rounded-lg bg-muted/50 p-3 text-sm">
                <p>{answer.answer}</p>
                {answer.evidence.length ? (
                  <ul className="space-y-0.5 text-xs text-muted-foreground">
                    {answer.evidence.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">Not connected to a live AI model · no accuracy scores shown</p>
              </div>
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SuggestionCard({
  s,
  onReview,
  canReview,
}: {
  s: AISuggestion & { createdAtLabel: string };
  onReview: (id: string, d: "reviewed" | "dismissed") => void;
  canReview: boolean;
}) {
  return (
    <article className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div>
            <h2 className="font-semibold leading-snug">{s.title}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {KIND_LABELS[s.kind]} · {s.dataPeriod} · {s.createdAtLabel} UTC
            </p>
          </div>
        </div>
        <StatusBadge kind="generic" status={s.status === "suggested" ? "pending" : s.status} label={s.status} />
      </div>
      <p className="text-sm text-muted-foreground">{s.detail}</p>
      {s.evidence.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {s.evidence.map((e, i) => (
              <li key={i} className="rounded bg-muted/60 px-2 py-1 font-mono">{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {s.requiresRole.map((r) => (
            <Badge key={r} variant="outline" className="text-[10px]">{r.replace(/_/g, " ")}</Badge>
          ))}
        </div>
        {canReview && s.status === "suggested" ? (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-9" onClick={() => onReview(s.id, "reviewed")}>
              <Check className="size-3.5" aria-hidden /> Reviewed
            </Button>
            <Button size="sm" variant="ghost" className="h-9 text-muted-foreground" onClick={() => onReview(s.id, "dismissed")}>
              <X className="size-3.5" aria-hidden /> Dismiss
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
