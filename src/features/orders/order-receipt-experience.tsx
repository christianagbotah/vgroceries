"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Download, FileText, Printer, QrCode, ReceiptText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PublicOrder } from "@/services/contracts";
import { usePublicBusinessContact } from "@/features/business/public-contact";
import { formatMoney } from "@/lib/money";
import {
  authenticatedOrderQrUrl,
  receiptDownloadHtml,
  receiptPlainText,
  receiptStatus,
} from "./receipt-utils";

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function OrderReceiptExperience({ order }: { order: PublicOrder }) {
  const [open, setOpen] = useState(false);
  const [qrData, setQrData] = useState("");
  const [qrError, setQrError] = useState(false);
  const reducedMotion = useReducedMotion();
  const state = receiptStatus(order);
  const contact = usePublicBusinessContact();
  const fileId = order.reference.replace(/[^a-z0-9_-]/gi, "_").slice(0, 75);
  const filePrefix = "Variety-" + fileId + (state.confirmed ? "-receipt" : "-order-summary");

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setQrError(false);
    setQrData("");
    const generate = async () => {
      try {
        const target = authenticatedOrderQrUrl(order.id, window.location.origin);
        // QR encoding happens locally on the customer's device. No order
        // data or verification secrets are sent to a third-party QR service.
        const generator = (await import("qrcode")).default;
        const src = await generator.toDataURL(target, {
          errorCorrectionLevel: "M",
          width: 280,
          margin: 2,
          color: { dark: "#0c5036", light: "#ffffff" },
        });
        if (mounted) setQrData(src);
      } catch {
        if (mounted) setQrError(true);
      }
    };
    void generate();
    return () => { mounted = false; };
  }, [open, order.id]);

  function printReceipt() {
    // A same-origin, script-free document renders only the immutable
    // current order snapshot instead of printing the entire app UI.
    const frame = document.createElement("iframe");
    frame.title = "Variety Groceries printable order record";
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.style.pointerEvents = "none";
    frame.style.left = "-10000px";
    frame.srcdoc = receiptDownloadHtml(order, contact);
    const remove = () => { if (frame.isConnected) frame.remove(); };
    frame.onload = () => {
      try {
        frame.contentWindow?.addEventListener("afterprint", remove, { once: true });
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch { remove(); }
    };
    document.body.appendChild(frame);
    window.setTimeout(remove, 60000);
  }

  return (
    <>
      <Button type="button" variant="outline" className="min-h-11 rounded-xl"
        onClick={() => setOpen(true)}>
        <ReceiptText className="size-4" aria-hidden />
        {state.confirmed ? "View purchase receipt" : "View order summary"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[93dvh] max-w-[min(96vw,640px)] overflow-y-auto border-none bg-[#f0f1ea] p-4 shadow-2xl sm:p-6">
          <DialogHeader className="text-left">
            <DialogTitle className="font-serif text-2xl font-bold text-[#0d422d]">
              Your grocery story, on paper
            </DialogTitle>
            <DialogDescription>
              A printable record pulled from your order. Download it, print it, or save it as a PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="relative mx-auto w-full max-w-[390px] pb-2">
            <div aria-hidden className="relative z-10 mx-5 h-9 rounded-t-2xl bg-[#164d35] shadow-[0_8px_18px_rgba(8,52,33,.22)]">
              <div className="absolute inset-x-4 top-3 h-2 rounded-full bg-[#061f16] shadow-inner" />
              <div className="absolute inset-x-1 bottom-0 h-1 bg-[#0b3625]" />
            </div>
            <motion.div
              initial={reducedMotion ? false : { clipPath: "inset(0 0 100% 0)", y: -12, opacity: .8 }}
              animate={{ clipPath: "inset(0 0 0% 0)", y: 0, opacity: 1 }}
              transition={{ duration: reducedMotion ? 0 : 1.05, ease: [.25, .75, .23, 1] }}
              className="relative mx-4 bg-white px-5 pb-8 pt-7 font-mono text-[#1d3026] shadow-[0_18px_30px_rgba(18,53,32,.16)] sm:px-7"
              aria-label={state.title}
            >
              <div className="text-center">
                <p className="text-xl font-black tracking-[-.07em]">VARIETY</p>
                <p className="text-xs font-black tracking-[.33em]">GROCERIES</p>
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest">{state.title}</p>
              </div>
              <div className="my-5 border-t border-dashed border-[#a4b0a6]" />
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] leading-5">
                <dt className="text-[#66766b]">Order</dt>
                <dd className="break-all text-right font-bold">{order.reference}</dd>
                <dt className="text-[#66766b]">Placed</dt>
                <dd className="text-right">{order.createdAtLabel} UTC</dd>
                <dt className="text-[#66766b]">Customer</dt>
                <dd className="break-words text-right">{order.customerName}</dd>
                <dt className="text-[#66766b]">Payment</dt>
                <dd className="text-right font-bold">{state.statusText}</dd>
              </dl>
              <div className="my-5 border-t border-dashed border-[#a4b0a6]" />
              <div className="space-y-3">
                {order.lines.map(line => (
                  <div key={line.id} className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{line.productName}</p>
                      <p className="text-[10px] leading-5 text-[#6a766b]">{line.variantName} · {line.quantity} × {formatMoney(line.unitPriceMinor)}</p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums">{formatMoney(line.lineTotalMinor)}</p>
                  </div>
                ))}
              </div>
              <div className="my-5 border-t border-dashed border-[#a4b0a6]" />
              <dl className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2"><dt>Subtotal</dt><dd>{formatMoney(order.subtotalMinor)}</dd></div>
                {order.discountMinor ? <div className="flex justify-between gap-2 text-[#23613c]"><dt>Discount</dt><dd>−{formatMoney(order.discountMinor)}</dd></div> : null}
                <div className="flex justify-between gap-2"><dt>Delivery / collection</dt><dd>{formatMoney(order.deliveryFeeMinor)}</dd></div>
                <div className="mt-3 flex justify-between gap-2 border-t-2 border-[#244634] pt-3 text-base font-black">
                  <dt>TOTAL</dt><dd className="tabular-nums">{formatMoney(order.totalMinor)}</dd>
                </div>
              </dl>
              <div className="my-5 border-t border-dashed border-[#a4b0a6]" />
              {qrData ? (
                <div className="flex flex-col items-center text-center">
                  <Image src={qrData} alt="QR code opening your private order page after sign-in"
                    width={160} height={160} unoptimized className="rounded-lg border border-[#dde8d7] p-2" />
                  <p className="mt-2 text-[10px] leading-4 text-[#607062]">
                    Scan to view this order after signing in. Not a payment or collection verification code.
                  </p>
                </div>
              ) : qrError ? (
                <p className="text-center text-xs">QR generation is unavailable. Your receipt details remain accessible.</p>
              ) : (
                <p role="status" className="text-center text-[11px]">Preparing private order QR…</p>
              )}
              <p className="mt-5 text-center text-[10px] leading-5 text-[#6a776c]">
                {state.confirmed ? "Payment state comes from the verified order record." :
                  "NOT PROOF OF PAYMENT. Payment has not been verified."}
                <br />Not a tax invoice · Keep your order reference for enquiries.
                {contact && (contact.supportPhone || contact.supportEmail || contact.receiptFooter) ? <><br />Current support information:<br />{[contact.supportPhone,contact.supportEmail,contact.receiptFooter].filter(Boolean).join(" · ")}</> : null}
              </p>
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-2 bg-[linear-gradient(135deg,transparent_6px,#f0f1ea_0),linear-gradient(225deg,transparent_6px,#f0f1ea_0)] bg-[size:12px_12px] bg-repeat-x" />
            </motion.div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" className="min-h-11 rounded-xl" onClick={printReceipt}>
              <Printer className="size-4" aria-hidden /> Print / Save as PDF
            </Button>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl"
              onClick={() => downloadFile(filePrefix + ".html", receiptDownloadHtml(order, contact), "text/html;charset=utf-8")}>
              <Download className="size-4" aria-hidden /> Download full receipt
            </Button>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl"
              onClick={() => downloadFile(filePrefix + ".txt", receiptPlainText(order, contact), "text/plain;charset=utf-8")}>
              <FileText className="size-4" aria-hidden /> Download text
            </Button>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl"
              disabled={!qrData}
              onClick={() => {
                if (!qrData) return;
                const link = document.createElement("a");
                link.download = filePrefix + "-QR.png";
                link.href = qrData;
                document.body.appendChild(link);
                link.click();
                link.remove();
              }}>
              <QrCode className="size-4" aria-hidden /> Download QR image
            </Button>
          </div>
          <p className="flex items-center gap-2 text-xs leading-5 text-[#596b5d]">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            QR generation stays on this device. Downloaded records reflect the current order state; refund and payment verification remain server-owned.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
