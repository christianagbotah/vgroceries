ALTER TABLE "ShipmentEvent" DROP CONSTRAINT "ShipmentEvent_kind_valid";

ALTER TABLE "ShipmentEvent"
ADD CONSTRAINT "ShipmentEvent_kind_valid" CHECK ("eventKind" IN (
  'fulfilment_handed_over','shipment_departed','shipment_arrived','shipment_handover','shipment_rerouted',
  'shipment_delayed','ready_for_pickup','customer_collected','rider_assigned','rider_accepted','rider_picked_up',
  'out_for_delivery','delivery_failed','delivery_rescheduled','delivered','returned_toward_store',
  'returned_to_dispatch','custom_checkpoint'
));
