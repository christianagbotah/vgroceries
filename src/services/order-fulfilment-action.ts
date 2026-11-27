/** Legacy screen names map to distinct strict backend commands; never the refund endpoint. */
export function orderFulfilmentRequest(input: Record<string, unknown>) {
  const orderId = input.orderId;
  if (typeof orderId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) return null;
  const action = input.action;
  const route = action === "confirm" ? "confirm" : action === "picking" ? "start-picking" : action === "packed" ? "pack" : action === "collect" ? "handover" : null;
  if (!route) return null;
  const body: Record<string, unknown> = {};
  if ((route === "pack" || route === "handover") && typeof input.note === "string" && input.note.trim()) body.note = input.note.trim();
  return {op: "admin.verified.fulfilment." + route, query: {orderId}, body, idempotencyKey: "fulfilment:" + route + ":" + orderId};
}
