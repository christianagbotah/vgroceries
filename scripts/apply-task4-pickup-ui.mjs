import fs from "node:fs";

const path = "src/app/(storefront)/checkout/page.tsx";
let source = fs.readFileSync(path, "utf8");

function replaceOnce(label, from, to) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Task 4 checkout patch anchor missing: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Task 4 checkout patch anchor is ambiguous: ${label}`);
  source = source.slice(0, index) + to + source.slice(index + from.length);
}

replaceOnce("client import",
  'import { apiOps, ApiError } from "@/services/client";',
  'import { api, apiOps, ApiError } from "@/services/client";\nimport type { CheckoutPickupOptionView } from "@/services/contracts";');

replaceOnce("pickup state",
  '  const [slots, setSlots] = useState<Slot[]>([]);',
  '  const [slots, setSlots] = useState<Slot[]>([]);\n  const [pickupOptions, setPickupOptions] = useState<CheckoutPickupOptionView[]>([]);\n  const [deliveryDestination, setDeliveryDestination] = useState<"doorstep" | "pickup_point">("doorstep");\n  const [pickupNodeId, setPickupNodeId] = useState("");');

replaceOnce("pickup effect insertion",
  '  }, [zoneId, fulfilment]);\n\n  const zone = zones.find((z) => z.id === zoneId);',
  `  }, [zoneId, fulfilment]);

  useEffect(() => {
    if (fulfilment !== "delivery" || !zoneId) {
      setPickupOptions([]);
      setPickupNodeId("");
      setDeliveryDestination("doorstep");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const options = await api<CheckoutPickupOptionView[]>("checkout.pickup-options", { query: { zoneId } });
        if (cancelled) return;
        setPickupOptions(options);
        setPickupNodeId((current) => options.some((option) => option.nodeId === current) ? current : "");
        if (!options.length) setDeliveryDestination("doorstep");
      } catch {
        if (!cancelled) {
          setPickupOptions([]);
          setPickupNodeId("");
          setDeliveryDestination("doorstep");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [zoneId, fulfilment]);

  const zone = zones.find((z) => z.id === zoneId);`);

replaceOnce("selected pickup",
  '  const slot = slots.find((s) => s.id === slotId);',
  `  const slot = slots.find((s) => s.id === slotId);
  const selectedPickup = pickupOptions.find((option) => option.nodeId === pickupNodeId);

  useEffect(() => {
    if (deliveryDestination === "pickup_point" && paymentMethod === "cash_on_delivery") setPaymentMethod("mobile_money");
  }, [deliveryDestination, paymentMethod]);`);

replaceOnce("address validation",
  `      if (addressId === "new") {
        if (!recipientName.trim()) errs.recipientName = "Who should receive the order?";
        if (!isValidGhanaPhone(phone)) errs.phone = "Recipient phone must be a +233 number.";
        if (!locality.trim()) errs.locality = "Enter the locality (e.g. Labone).";
        if (!street.trim()) errs.street = "Enter the street or a descriptive address.";
        if (ghanaPostGps && !isValidGhanaPostGps(ghanaPostGps)) errs.ghanaPostGps = "GhanaPostGPS addresses look like GA-457-2029.";
      }`,
  `      if (deliveryDestination === "pickup_point") {
        if (!pickupNodeId || !pickupOptions.some((option) => option.nodeId === pickupNodeId)) errs.pickupNodeId = "Choose an available pickup centre.";
      } else if (addressId === "new") {
        if (!recipientName.trim()) errs.recipientName = "Who should receive the order?";
        if (!isValidGhanaPhone(phone)) errs.phone = "Recipient phone must be a +233 number.";
        if (!locality.trim()) errs.locality = "Enter the locality (e.g. Labone).";
        if (!street.trim()) errs.street = "Enter the street or a descriptive address.";
        if (ghanaPostGps && !isValidGhanaPostGps(ghanaPostGps)) errs.ghanaPostGps = "GhanaPostGPS addresses look like GA-457-2029.";
      }`);

replaceOnce("checkout payload destination",
  '        fulfilment,\n        zoneId: fulfilment === "delivery" ? zoneId : undefined,',
  `        fulfilment,
        deliveryDestination: fulfilment === "delivery"
          ? deliveryDestination === "pickup_point"
            ? { kind: "pickup_point", finalPickupNodeId: pickupNodeId }
            : { kind: "doorstep" }
          : undefined,
        zoneId: fulfilment === "delivery" ? zoneId : undefined,`);

replaceOnce("saved address payload",
  '        addressId: fulfilment === "delivery" && addressId !== "new" ? addressId : undefined,',
  '        addressId: fulfilment === "delivery" && deliveryDestination === "doorstep" && addressId !== "new" ? addressId : undefined,');

replaceOnce("guest address payload",
  '          fulfilment === "delivery" && addressId === "new"',
  '          fulfilment === "delivery" && deliveryDestination === "doorstep" && addressId === "new"');

replaceOnce("destination picker before address",
  '                <div className="space-y-4 rounded-lg border p-3 sm:p-4">\n                  <div>\n                    <Label htmlFor="co-address">Delivery address</Label>',
  `                {pickupOptions.length ? (
                  <div className="space-y-3 rounded-lg border p-3 sm:p-4">
                    <div>
                      <Label>Delivery destination</Label>
                      <p className="mt-1 text-xs text-muted-foreground">Choose doorstep delivery or collect from a configured Variety Groceries pickup centre.</p>
                    </div>
                    <RadioGroup
                      value={deliveryDestination}
                      onValueChange={(value) => {
                        const next = value as "doorstep" | "pickup_point";
                        setDeliveryDestination(next);
                        if (next === "pickup_point" && !pickupNodeId) setPickupNodeId(pickupOptions[0]?.nodeId ?? "");
                      }}
                      className="grid gap-2"
                    >
                      <Label data-clickable htmlFor="destination-doorstep" className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal", deliveryDestination === "doorstep" && "border-primary bg-primary/5")}>
                        <RadioGroupItem value="doorstep" id="destination-doorstep" className="mt-1" />
                        <span><span className="font-medium">Doorstep delivery</span><span className="block text-sm text-muted-foreground">Deliver to your saved or new address.</span></span>
                      </Label>
                      {pickupOptions.map((option) => (
                        <Label key={option.nodeId} data-clickable htmlFor={\`destination-pickup-\${option.nodeId}\`} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal", deliveryDestination === "pickup_point" && pickupNodeId === option.nodeId && "border-primary bg-primary/5")}>
                          <RadioGroupItem value="pickup_point" id={\`destination-pickup-\${option.nodeId}\`} className="mt-1" onClick={() => setPickupNodeId(option.nodeId)} />
                          <span className="min-w-0">
                            <span className="font-medium">{option.publicName}</span>
                            <span className="block text-sm text-muted-foreground">{[option.addressLine, option.locality, option.region].filter(Boolean).join(" · ") || "Pickup centre"}</span>
                            {option.publicDirections ? <span className="block text-xs text-muted-foreground">{option.publicDirections}</span> : null}
                          </span>
                        </Label>
                      ))}
                    </RadioGroup>
                    {field("pickupNodeId")}
                  </div>
                ) : null}

                {deliveryDestination === "doorstep" ? (
                <div className="space-y-4 rounded-lg border p-3 sm:p-4">
                  <div>
                    <Label htmlFor="co-address">Delivery address</Label>`);

replaceOnce("address block close",
  `                  ) : null}
                </div>
              </div>
            ) : (`,
  `                  ) : null}
                </div>
                ) : selectedPickup ? (
                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <p className="font-medium">Collect from {selectedPickup.publicName}</p>
                    <p className="mt-1 text-muted-foreground">{[selectedPickup.addressLine, selectedPickup.locality, selectedPickup.region].filter(Boolean).join(" · ")}</p>
                    {selectedPickup.ghanaPostGps ? <p className="mt-1 font-mono text-xs text-muted-foreground">{selectedPickup.ghanaPostGps}</p> : null}
                    {selectedPickup.publicContact ? <p className="mt-1 text-xs text-muted-foreground">Contact: {selectedPickup.publicContact}</p> : null}
                  </div>
                ) : null}
              </div>
            ) : (`);

replaceOnce("cod availability",
  '.filter((m) => (m === "cash_on_delivery" ? fulfilment === "delivery" : true))',
  '.filter((m) => (m === "cash_on_delivery" ? fulfilment === "delivery" && deliveryDestination === "doorstep" : true))');

fs.writeFileSync(path, source);
console.log("Task 4 pickup checkout UI patch applied.");
