/**
 * Shared API contracts — public barrel.
 *
 * Everything a client (web today, React Native tomorrow) or the production
 * backend needs to speak the Variety Groceries service contract:
 *   - response/view types per business area,
 *   - canonical error codes + pagination + idempotency primitives,
 *   - zod request validation schemas (single source, reused server-side).
 *
 * FRAMEWORK-FREE ZONE: no Next.js / React / Prisma / mock-store imports.
 * Only pure types (src/types/domain.ts) and zod are allowed.
 */

export * from "./common";
export * from "./catalog";
export * from "./checkout";
export * from "./account";
export * from "./returns";
export * from "./inventory";
export * from "./pos";
export * from "./dispatch";
export * from "./rider";
export * from "./ai";
export * from "./staff";
export * from "./validation";
