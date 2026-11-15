-- Staff-observed appointment exceptions are evidence only.
-- They never cancel an order, release reserved stock, move funds, or certify collection.
CREATE TABLE "PickupAttendanceRecord" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "appointmentBookedAt" TIMESTAMPTZ(3) NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3) NOT NULL,
  "kind" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "note" TEXT,
  "observedAt" TIMESTAMPTZ(3) NOT NULL,
  "recordedById" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PickupAttendanceRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PickupAttendanceRecord_valid_window" CHECK ("startsAt" < "endsAt"),
  CONSTRAINT "PickupAttendanceRecord_valid_kind_reason" CHECK (
    ("kind"='late_arrival' AND "reason" IN ('customer_arrived_after_start','centre_delay','other'))
    OR ("kind"='missed_window' AND "reason" IN ('customer_not_present','customer_unreachable','other'))
  ),
  CONSTRAINT "PickupAttendanceRecord_reason_note_bounded" CHECK (
    length("note") <= 350 AND (("note" IS NULL) OR length(btrim("note")) > 0)
  ),
  CONSTRAINT "PickupAttendanceRecord_observed_after_start" CHECK (
    ("kind"='late_arrival' AND "observedAt">="startsAt")
    OR ("kind"='missed_window' AND "observedAt">="endsAt")
  )
);
CREATE UNIQUE INDEX "PickupAttendanceRecord_orderId_appointmentBookedAt_kind_key"
  ON "PickupAttendanceRecord"("orderId","appointmentBookedAt","kind");
CREATE INDEX "PickupAttendanceRecord_nodeId_observedAt_idx"
  ON "PickupAttendanceRecord"("nodeId","observedAt");
CREATE INDEX "PickupAttendanceRecord_orderId_observedAt_idx"
  ON "PickupAttendanceRecord"("orderId","observedAt");
ALTER TABLE "PickupAttendanceRecord"
  ADD CONSTRAINT "PickupAttendanceRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PickupAttendanceRecord_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LogisticsNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PickupAttendanceRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION protect_pickup_attendance_record() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'pickup attendance evidence is immutable' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER pickup_attendance_record_immutable
  BEFORE UPDATE OR DELETE ON "PickupAttendanceRecord"
  FOR EACH ROW EXECUTE FUNCTION protect_pickup_attendance_record();
