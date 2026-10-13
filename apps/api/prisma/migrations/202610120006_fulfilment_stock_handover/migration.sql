-- Fulfilment + Stock Handover Authority: operational picking/packing state and once-only lot depletion.

-- Reservation already supports consumed from migration 002. Reassert the production vocabulary
-- here because this authority is the first writer of the consumed terminal state.
ALTER TABLE "Reservation" DROP CONSTRAINT reservation_state;
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_state
  CHECK (state IN ('active','released','consumed','expired'));

CREATE TABLE "FulfilmentRun" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "confirmedBy" TEXT,
  "confirmedAt" TIMESTAMPTZ(3),
  "pickingStartedBy" TEXT,
  "pickingStartedAt" TIMESTAMPTZ(3),
  "packedBy" TEXT,
  "packedAt" TIMESTAMPTZ(3),
  "packNote" TEXT,
  "handedOverBy" TEXT,
  "handedOverAt" TIMESTAMPTZ(3),
  "handoverKind" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FulfilmentRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FulfilmentRun_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FulfilmentRun_version_positive" CHECK ("version" > 0),
  CONSTRAINT "FulfilmentRun_packNote_check" CHECK ("packNote" IS NULL OR length(btrim("packNote")) BETWEEN 1 AND 500),
  CONSTRAINT "FulfilmentRun_handover_check" CHECK (
    ("handoverKind" IS NULL AND "handedOverBy" IS NULL AND "handedOverAt" IS NULL)
    OR
    ("handoverKind" IN ('dispatch','collection') AND "handedOverBy" IS NOT NULL AND "handedOverAt" IS NOT NULL)
  )
);
CREATE UNIQUE INDEX "FulfilmentRun_orderId_key" ON "FulfilmentRun"("orderId");
CREATE INDEX "FulfilmentRun_locationId_createdAt_idx" ON "FulfilmentRun"("locationId","createdAt");

CREATE TABLE "FulfilmentPick" (
  "id" TEXT NOT NULL,
  "fulfilmentRunId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderLineId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "pickedQuantity" DECIMAL(15,3) NOT NULL,
  "state" TEXT NOT NULL,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "recordedAt" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "FulfilmentPick_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FulfilmentPick_fulfilmentRunId_fkey" FOREIGN KEY ("fulfilmentRunId") REFERENCES "FulfilmentRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FulfilmentPick_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FulfilmentPick_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "FulfilmentPick_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "FulfilmentPick_picked_nonnegative" CHECK ("pickedQuantity" >= 0),
  CONSTRAINT "FulfilmentPick_picked_not_over" CHECK ("pickedQuantity" <= "quantity"),
  CONSTRAINT "FulfilmentPick_state_check" CHECK ("state" IN ('picked','shortage')),
  CONSTRAINT "FulfilmentPick_state_quantity_check" CHECK (
    ("state" = 'picked' AND "pickedQuantity" = "quantity")
    OR ("state" = 'shortage' AND "pickedQuantity" < "quantity")
  ),
  CONSTRAINT "FulfilmentPick_note_check" CHECK ("note" IS NULL OR length(btrim("note")) BETWEEN 1 AND 500),
  CONSTRAINT "FulfilmentPick_version_positive" CHECK ("version" > 0)
);
CREATE UNIQUE INDEX "FulfilmentPick_reservationId_key" ON "FulfilmentPick"("reservationId");
CREATE INDEX "FulfilmentPick_fulfilmentRunId_state_idx" ON "FulfilmentPick"("fulfilmentRunId","state");
CREATE INDEX "FulfilmentPick_orderId_recordedAt_idx" ON "FulfilmentPick"("orderId","recordedAt");

CREATE TABLE "StockDepletion" (
  "id" TEXT NOT NULL,
  "claimType" TEXT NOT NULL,
  "claimId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockDepletion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockDepletion_claimType_check" CHECK ("claimType" IN ('order','pos_draft')),
  CONSTRAINT "StockDepletion_kind_check" CHECK ("kind" IN ('dispatch_handover','collection_handover','pos_handover'))
);
CREATE UNIQUE INDEX "StockDepletion_claimType_claimId_key" ON "StockDepletion"("claimType","claimId");
CREATE INDEX "StockDepletion_locationId_createdAt_idx" ON "StockDepletion"("locationId","createdAt");

CREATE TABLE "StockDepletionLine" (
  "id" TEXT NOT NULL,
  "depletionId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "claimLineId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "quantity" DECIMAL(15,3) NOT NULL,
  "lotQuantityBefore" DECIMAL(15,3) NOT NULL,
  "lotQuantityAfter" DECIMAL(15,3) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockDepletionLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockDepletionLine_depletionId_fkey" FOREIGN KEY ("depletionId") REFERENCES "StockDepletion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockDepletionLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockDepletionLine_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "StockDepletionLine_quantity_positive" CHECK ("quantity" > 0),
  CONSTRAINT "StockDepletionLine_before_nonnegative" CHECK ("lotQuantityBefore" >= 0),
  CONSTRAINT "StockDepletionLine_after_nonnegative" CHECK ("lotQuantityAfter" >= 0),
  CONSTRAINT "StockDepletionLine_arithmetic" CHECK ("lotQuantityBefore" - "quantity" = "lotQuantityAfter")
);
CREATE UNIQUE INDEX "StockDepletionLine_reservationId_key" ON "StockDepletionLine"("reservationId");
CREATE INDEX "StockDepletionLine_depletionId_id_idx" ON "StockDepletionLine"("depletionId","id");
CREATE INDEX "StockDepletionLine_lotId_createdAt_idx" ON "StockDepletionLine"("lotId","createdAt");

CREATE OR REPLACE FUNCTION protect_fulfilment_run_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'fulfilment run cannot be deleted';
END;
$$;
CREATE TRIGGER "FulfilmentRun_no_delete" BEFORE DELETE ON "FulfilmentRun" FOR EACH ROW EXECUTE FUNCTION protect_fulfilment_run_delete();

CREATE OR REPLACE FUNCTION protect_fulfilment_pick_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fulfilment pick cannot be deleted';
  END IF;
  IF NEW."fulfilmentRunId" IS DISTINCT FROM OLD."fulfilmentRunId"
     OR NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."orderLineId" IS DISTINCT FROM OLD."orderLineId"
     OR NEW."reservationId" IS DISTINCT FROM OLD."reservationId"
     OR NEW."lotId" IS DISTINCT FROM OLD."lotId"
     OR NEW."variantId" IS DISTINCT FROM OLD."variantId"
     OR NEW."quantity" IS DISTINCT FROM OLD."quantity" THEN
    RAISE EXCEPTION 'fulfilment pick provenance is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "FulfilmentPick_identity_immutable" BEFORE UPDATE OR DELETE ON "FulfilmentPick" FOR EACH ROW EXECUTE FUNCTION protect_fulfilment_pick_identity();

CREATE OR REPLACE FUNCTION prevent_stock_depletion_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock depletion history is append-only';
END;
$$;
CREATE TRIGGER "StockDepletion_append_only" BEFORE UPDATE OR DELETE ON "StockDepletion" FOR EACH ROW EXECUTE FUNCTION prevent_stock_depletion_rewrite();
CREATE TRIGGER "StockDepletionLine_append_only" BEFORE UPDATE OR DELETE ON "StockDepletionLine" FOR EACH ROW EXECUTE FUNCTION prevent_stock_depletion_rewrite();
