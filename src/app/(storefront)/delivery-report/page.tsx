import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, FileText, CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Delivery report",
  description:
    "Download the Variety Groceries delivery and integration report prepared for the solution architect.",
};

const REPORT_URL = "/reports/Variety-Groceries-Delivery-and-Integration-Report.docx";

const CONTENTS = [
  "Executive summary with the key delivery numbers",
  "Architecture diagram and the eight business-engine invariants",
  "Integration map: swap point, error codes, operation surface, connection order",
  "Business rules and verification evidence (21/21 acceptance checks)",
  "Repository access and suggested read order",
  "Architect decision checklist — auth, payments, couriers, schema, tax, AI",
];

export default function DeliveryReportPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-10 pt-6">
      <h1 className="font-serif text-2xl font-bold sm:text-3xl">Delivery &amp; Integration Report</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        The handover pack prepared for the solution architect — everything needed to review this
        prototype and plan the production build.
      </p>

      <Card className="mt-6">
        <CardHeader className="pb-4">
          <div className="flex items-start gap-3">
            <div
              className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              aria-hidden
            >
              <FileText className="size-6" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base leading-snug">
                Variety Groceries — Delivery and Integration Report
              </CardTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="secondary">Word (.docx)</Badge>
                <Badge variant="secondary">12 pages</Badge>
                <Badge variant="secondary">179 KB</Badge>
                <Badge variant="secondary">English</Badge>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">What the report covers:</p>
          <ul className="mt-2 space-y-2">
            {CONTENTS.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <Separator className="my-5" />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Same-origin static file: the download attribute triggers a save instead of navigation. */}
            <Button asChild size="lg" className="h-11 px-6 text-base">
              <a href={REPORT_URL} download="Variety-Groceries-Delivery-and-Integration-Report.docx">
                <Download className="size-5" aria-hidden />
                Download the report (.docx)
              </a>
            </Button>
            <p className="text-xs text-muted-foreground sm:ml-2">
              Opens in Microsoft Word, Google Docs or LibreOffice.
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Also available to staff from the back office under{" "}
        <span className="font-medium">Reports → Project documents</span>.
      </p>
    </div>
  );
}
