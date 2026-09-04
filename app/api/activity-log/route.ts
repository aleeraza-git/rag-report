import { NextResponse } from "next/server";
import { getOrderedRows, getRowsSince, upsert } from "@/lib/db";

// Reports need the whole window, so callers ask for history by time. Without
// `since` we fall back to a generous recent slice for the live dashboard.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50000, 200000);
  return NextResponse.json(
    since ? getRowsSince("activity_log", since, limit)
          : getOrderedRows("activity_log", 2000)
  );
}

export async function POST(req: Request) {
  const { id, data } = await req.json();
  upsert("activity_log", id, data);
  return NextResponse.json({ ok: true });
}
