import { NextResponse } from "next/server";
import { getOneRow, upsert } from "@/lib/db";

export async function GET() {
  const row = getOneRow("daily_stats", "today");
  return NextResponse.json(row ?? { id: "today", data: { received: 0, resolved: 0, pending: 0, inprogress: 0 } });
}

export async function POST(req: Request) {
  const { data } = await req.json();
  upsert("daily_stats", "today", data);
  return NextResponse.json({ ok: true });
}
