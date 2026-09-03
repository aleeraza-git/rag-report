import { NextResponse } from "next/server";
import { getOrderedRows, upsert } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getOrderedRows("activity_log", 500));
}

export async function POST(req: Request) {
  const { id, data } = await req.json();
  upsert("activity_log", id, data);
  return NextResponse.json({ ok: true });
}
