import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

/** Shared layout for owner-editable support and policy content. */
export function InfoPageShell({
  title,
  intro,
  backHref = "/help",
  backLabel = "Help centre",
  children,
}: {
  title: string;
  intro: string;
  backHref?: string;
  backLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <Link href="/" className="hover:underline focus-visible:underline">Home</Link>
        <span aria-hidden> / </span>
        <Link href={backHref} className="hover:underline focus-visible:underline">{backLabel}</Link>
      </nav>
      <h1 className="mt-2 font-serif text-2xl font-bold sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{intro}</p>
      <div className="mt-6 space-y-4">{children}</div>
      <Button asChild variant="ghost" size="sm" className="mt-8 h-10">
        <Link href={backHref}>
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </Link>
      </Button>
    </div>
  );
}

export function InfoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_strong]:text-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

export function HelpIcon() {
  return <CircleHelp className="size-6 text-primary" aria-hidden />;
}
