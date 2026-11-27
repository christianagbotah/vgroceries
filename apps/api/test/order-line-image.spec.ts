import { test } from "node:test";
import assert from "node:assert/strict";
import { orderLineImage } from "../src/orders/order-line-image";

test("order thumbnail is available only for approved published same-site media", () => {
  const media = { publicUrl: "/media/products/approved/water.jpg", status: "approved", archivedAt: null };
  assert.equal(orderLineImage({ published: true, featuredMedia: media }), "https://portal.varietygroceries.com/media/products/approved/water.jpg");
  assert.equal(orderLineImage({ published: false, featuredMedia: media }), undefined);
  assert.equal(orderLineImage({ published: true, featuredMedia: null }), undefined);
  assert.equal(orderLineImage({ published: true, featuredMedia: { ...media, status: "draft" } }), undefined);
  assert.equal(orderLineImage({ published: true, featuredMedia: { ...media, archivedAt: new Date() } }), undefined);
  for (const publicUrl of ["https://evil.example/media/products/a.jpg", "/media/private/a.jpg", "/media/products/a.jpg?secret=1", "/media/products/a.svg", "//evil.example/a.jpg"]) {
    assert.equal(orderLineImage({ published: true, featuredMedia: { ...media, publicUrl } }), undefined);
  }
});
