import { Database } from "../src/database/database";
import { readConfig } from "../src/config";
import { randomUUID } from "node:crypto";

async function main() {
  if (process.env.NODE_ENV === "production")
    throw Error("Preview seeding is prohibited in production");
  const config = readConfig();
  const db = new Database(config);
  try {
    await db.$transaction(async (tx) => {
      await tx.location.upsert({
        where: { id: config.stockLocationId },
        create: { id: config.stockLocationId, name: "Preview stock location" },
        update: {},
      });
      await tx.category.upsert({
        where: { id: "preview_food" },
        create: {
          id: "preview_food",
          slug: "preview-food",
          name: "Preview food",
        },
        update: {},
      });
      await tx.product.upsert({
        where: { id: "preview_rice" },
        create: {
          id: "preview_rice",
          slug: "preview-rice",
          name: "Preview rice",
          categoryId: "preview_food",
          published: true,
          tags: ["preview"],
          description:
            "Sample data for private integration; replace with owner-confirmed products.",
          shortDescription: "Preview fixture",
          image: "/images/placeholder.webp",
        },
        update: {},
      });
      await tx.variant.upsert({
        where: { id: "preview_rice_kg" },
        create: {
          id: "preview_rice_kg",
          productId: "preview_rice",
          sku: "PREVIEW-RICE-KG",
          name: "1 kg",
          unit: "kg",
          priceMinor: 2500,
        },
        update: {},
      });
      const position = await tx.stockPosition.upsert({
        where: {
          variantId_locationId: {
            variantId: "preview_rice_kg",
            locationId: config.stockLocationId,
          },
        },
        create: {
          variantId: "preview_rice_kg",
          locationId: config.stockLocationId,
        },
        update: {},
      });
      if (
        !(await tx.stockLot.findUnique({
          where: { id: "preview_initial_lot" },
        }))
      ) {
        const receipt = await tx.stockReceipt.create({
          data: {
            receivedBy: "preview-bootstrap",
            note: "Explicit preview fixture",
          },
        });
        await tx.stockLot.create({
          data: {
            id: "preview_initial_lot",
            positionId: position.id,
            receiptId: receipt.id,
            lotNumber: "PREVIEW-INITIAL",
            quantity: "25",
          },
        });
        await tx.stockMovement.create({
          data: {
            lotId: "preview_initial_lot",
            receiptId: receipt.id,
            delta: "25",
            resultingQty: "25",
            actorId: "preview-bootstrap",
            reason: "receive",
          },
        });
        await tx.auditEvent.create({
          data: {
            actorId: "preview-bootstrap",
            action: "inventory.preview_seeded",
            entityId: receipt.id,
            requestId: randomUUID(),
            details: { preview: true },
          },
        });
        await tx.outboxEvent.create({
          data: {
            type: "inventory.preview_seeded",
            aggregateId: receipt.id,
            payload: { preview: true },
          },
        });
      }
    });
    console.log(
      "Preview catalogue created without demo credentials or automatic stock replenishment.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Preview seed failed. Use a non-production integration database.",
  );
  process.exitCode = 1;
});
