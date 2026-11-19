import type { PickupAppointmentPolicyInput } from "@variety/contracts";

export interface ExistingPickupBooking {
  startsAt: Date;
  endsAt: Date;
}

function toMinute(clock: string) {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}

/**
 * An edited centre schedule must continue to accommodate every existing
 * future or currently in-progress booking, even if the new policy is disabled.
 *
 * lead time and booking horizon limit new bookings only; they do not
 * retroactively invalidate appointments already committed by customers.
 * This function does not mutate bookings, orders, stock or financial state.
 */
export function incompatiblePickupBookingCount(
  policy: PickupAppointmentPolicyInput,
  bookings: readonly ExistingPickupBooking[],
): number {
  const opening = toMinute(policy.opensAt);
  const closing = toMinute(policy.closesAt);
  const countByStart = new Map<number, number>();
  let incompatible = 0;
  for (const booked of bookings) {
    const start = booked.startsAt;
    const startTime = start.getTime();
    const minute = start.getUTCHours() * 60 + start.getUTCMinutes();
    const weekday = start.getUTCDay() || 7;
    const endsCorrectly = booked.endsAt.getTime() === startTime + policy.slotMinutes * 60_000;
    const withinHours = minute >= opening && minute + policy.slotMinutes <= closing;
    const aligned = (minute - opening) % policy.slotMinutes === 0 &&
      start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0;
    if (!policy.serviceDays.includes(weekday) || !endsCorrectly || !withinHours || !aligned) {
      incompatible++;
      continue;
    }
    const reserved = (countByStart.get(startTime) ?? 0) + 1;
    countByStart.set(startTime, reserved);
    if (reserved > policy.capacity) incompatible++;
  }
  return incompatible;
}
