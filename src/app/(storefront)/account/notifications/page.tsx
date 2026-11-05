"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { apiOps, ApiError } from "@/services/client";
import type { NotificationListResponse, NotificationReadResponse, NotificationReadAllResponse } from "@/services/contracts";
import { createTrackingRequestCoordinator as createRequestCoordinator } from "@/features/orders/tracking-requests";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type InboxResult =
  | { action: "list"; append: boolean; value: NotificationListResponse }
  | { action: "read"; value: NotificationReadResponse }
  | { action: "read-all"; value: NotificationReadAllResponse };

export default function AccountNotificationsPage() {
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests] = useState(() => createRequestCoordinator<InboxResult>({
    onStart: () => { setBusy(true); setError(null); },
    onValue: result => setData(current => {
      if (result.action === "list") {
        const items = result.append && current
          ? [...current.items, ...result.value.items.filter(item => !current.items.some(existing => existing.id === item.id))]
          : result.value.items;
        return { ...result.value, items };
      }
      if (!current) return current;
      if (result.action === "read-all") return { ...current, unreadCount: 0,
        items: current.items.map(item => ({ ...item, readAt: item.readAt ?? result.value.readAt })) };
      const wasUnread = current.items.some(item => item.id === result.value.id && !item.readAt);
      return { ...current, unreadCount: Math.max(0, current.unreadCount - (wasUnread ? 1 : 0)),
        items: current.items.map(item => item.id === result.value.id ? { ...item, readAt: result.value.readAt } : item) };
    }),
    onError: cause => setError(cause instanceof ApiError ? cause.message : "Could not update your notifications. Please try again."),
    onFinish: () => setBusy(false),
  }));

  useEffect(() => {
    void requests.load(async () => ({ action: "list", append: false, value: await apiOps.accountNotifications() }));
    return () => requests.invalidate();
  }, [requests]);

  const load = (cursor?: string) => requests.load(async () => ({
    action: "list", append: !!cursor, value: await apiOps.accountNotifications(cursor),
  }));

  return (
    <section aria-labelledby="inbox-title" aria-busy={busy} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="inbox-title" className="flex items-center gap-2 text-xl font-semibold"><Bell className="size-5" aria-hidden /> Notifications</h2>
          <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.unreadCount} unread · Order and delivery updates` : "Order and delivery updates"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="min-h-11 gap-2" disabled={busy} onClick={() => void load()}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} aria-hidden /> Refresh
          </Button>
          <Button variant="outline" className="min-h-11 gap-2" disabled={busy || !data?.unreadCount}
            onClick={() => void requests.load(async () => ({ action: "read-all", value: await apiOps.accountNotificationsReadAll() }))}>
            <CheckCheck className="size-4" aria-hidden /> Mark all as read
          </Button>
        </div>
      </div>
      {error && <ErrorState message={error} />}
      {!data && busy && <LoadingState rows={4} label="Loading notifications" />}
      {data && !data.items.length && <EmptyState icon={Bell} title="You’re all caught up" description="Your order and delivery updates will appear here." />}
      {data && data.items.length > 0 && (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {data.items.map(item => (
            <li key={item.id} className={cn("p-4 sm:p-5", !item.readAt && "bg-primary/5")}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="font-semibold">{item.title}</h3>
                {!item.readAt && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Unread</span>}
                <time dateTime={item.createdAt} className="text-xs text-muted-foreground sm:ml-auto">{formatDateTime(item.createdAt)}</time>
              </div>
              <p className="mt-2 break-words text-sm text-muted-foreground">{item.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link href={`/account/orders/${encodeURIComponent(item.orderId)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">View order</Link>
                {!item.readAt && <Button variant="ghost" className="min-h-11" disabled={busy}
                  aria-label={`Mark ${item.title.toLowerCase()} as read`}
                  onClick={() => void requests.load(async () => ({ action: "read", value: await apiOps.accountNotificationRead(item.id) }))}>Mark as read</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data?.hasMore && data.nextCursor && <div className="flex justify-center">
        <Button variant="outline" className="min-h-11" disabled={busy} onClick={() => void load(data.nextCursor!)}>Load more updates</Button>
      </div>}
    </section>
  );
}
