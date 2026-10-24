import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const client = (process.env.ADSENSE_CLIENT ?? process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "").trim();
  if (!/^ca-pub-\d{16}$/.test(client)) {
    return new NextResponse("AdSense is not configured.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const publisherId = client.replace(/^ca-/, "");
  return new NextResponse(`google.com, ${publisherId}, DIRECT, f08c47fec0942fa0\n`, {
    status: 200,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
