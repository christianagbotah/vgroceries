ALTER TABLE "CustomerAddress"
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6),
  ADD COLUMN "locationSource" TEXT;

ALTER TABLE "OrderDeliveryAddress"
  ADD COLUMN "latitude" DECIMAL(9,6),
  ADD COLUMN "longitude" DECIMAL(9,6),
  ADD COLUMN "locationSource" TEXT;

ALTER TABLE "CustomerAddress"
  ADD CONSTRAINT "CustomerAddress_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "CustomerAddress_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "CustomerAddress_location_pair_check" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "CustomerAddress_location_source_check" CHECK ("locationSource" IS NULL OR "locationSource" IN ('device_gps', 'map_pin'));

ALTER TABLE "OrderDeliveryAddress"
  ADD CONSTRAINT "OrderDeliveryAddress_latitude_check" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90),
  ADD CONSTRAINT "OrderDeliveryAddress_longitude_check" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180),
  ADD CONSTRAINT "OrderDeliveryAddress_location_pair_check" CHECK (("latitude" IS NULL) = ("longitude" IS NULL)),
  ADD CONSTRAINT "OrderDeliveryAddress_location_source_check" CHECK ("locationSource" IS NULL OR "locationSource" IN ('device_gps', 'map_pin'));
