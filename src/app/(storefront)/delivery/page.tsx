import { InfoPageShell, InfoSection } from "@/components/shared/info-page-shell";
import { getStore } from "@/services/mock/store";
import { formatMoney } from "@/lib/money";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery information" };

export default function DeliveryPage() {
  const zones = getStore().zones.filter((z) => z.isActive);
  return (
    <InfoPageShell
      title="Delivery information"
      intro="Owner-configurable zones, fees, minimum orders and service hours. Values below are demo defaults, not coverage promises."
    >
      <div className="overflow-hidden rounded-xl border">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left">
              <tr>
                <th className="p-3 font-semibold">Zone</th>
                <th className="p-3 font-semibold">Areas (demo)</th>
                <th className="p-3 font-semibold">Fee</th>
                <th className="p-3 font-semibold">Minimum order</th>
                <th className="p-3 font-semibold">Hours</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id} className="border-t">
                  <td className="p-3 font-medium">{z.name}</td>
                  <td className="p-3 text-muted-foreground">{z.areas.join(", ")}</td>
                  <td className="p-3 tabular-nums">{formatMoney(z.feeMinor)}</td>
                  <td className="p-3 tabular-nums">{formatMoney(z.minimumOrderMinor)}</td>
                  <td className="p-3 text-muted-foreground">{z.serviceHours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <InfoSection title="Slots and cut-offs">
        <p>
          Each zone offers daily slots with limited capacity. Same-day orders close at the zone
          cut-off shown at checkout. Slot capacity is shared across customers — a full slot cannot
          be selected.
        </p>
      </InfoSection>
      <InfoSection title="Cash on delivery">
        <p>
          Available in active zones. Delivery completion and cash collection are recorded as
          separate events, and riders remit collected cash to the store for reconciliation — you
          will never be asked to pay twice for the same order.
        </p>
      </InfoSection>
      <InfoSection title="Collection">
        <p>
          Prefer to collect? Choose collection at checkout, pay online or with cash at the counter,
          and we will have your order packed and waiting.
        </p>
      </InfoSection>
      <InfoSection title="What we cannot promise">
        <p>
          We do not guarantee delivery times, nationwide coverage, or live courier integrations.
          Riders are our own team plus contracted partners; external courier providers join only
          after the owner verifies their coverage and terms.
        </p>
      </InfoSection>
    </InfoPageShell>
  );
}
