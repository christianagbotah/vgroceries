/**
 * Development-only mock API catch-all: /api/mock/v1/<operation>
 * Operation path segments are joined with "." and dispatched by
 * src/services/mock/router.ts. Single process, no persistence.
 */

import { NextRequest, NextResponse } from "next/server";
import { handleApi } from "@/services/mock/router";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }): Promise<NextResponse> {
  if (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL) {
    return NextResponse.json({ ok: false, error: { code: "NOT_FOUND", message: "Demo operations are unavailable in backend mode." } }, { status: 404 });
  }
  const { path } = await ctx.params;
  const method = req.method === "POST" ? "POST" : "GET";
  const query = new URL(req.url).searchParams;
  let body: Record<string, unknown> = {};
  if (method === "POST") {
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
  }
  const result = await handleApi({
    path: (path ?? []).join("."),
    method,
    query,
    body,
  });
  return NextResponse.json(result.json, { status: result.status });
}

export const GET = handle;
export const POST = handle;
