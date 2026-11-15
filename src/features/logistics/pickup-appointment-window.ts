/**
 * Advisory-only classification for a server-authoritative pickup appointment.
 * Passing a booked slot's end does NOT cancel the order, mark a no-show,
 * release inventory or confirm physical collection.
 */
export type PickupWindowState =
  | "none" | "completed" | "cancelled" | "upcoming" | "open" | "elapsed" | "unassessed";

export function classifyPickupAppointmentWindow(
  appointment: { status: string; startsAt: string; endsAt: string } | null | undefined,
  nowMs: number | null,
): PickupWindowState {
  if (!appointment) return "none";
  if (appointment.status === "cancelled") return "cancelled";
  if (appointment.status === "completed") return "completed";
  if (appointment.status !== "booked") return "unassessed";
  if (nowMs === null || !Number.isFinite(nowMs)) return "unassessed";
  const starts = Date.parse(appointment.startsAt);
  const ends = Date.parse(appointment.endsAt);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts)
    return "unassessed";
  if (nowMs >= ends) return "elapsed";
  if (nowMs >= starts) return "open";
  return "upcoming";
}
