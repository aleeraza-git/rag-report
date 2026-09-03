import { NextResponse } from "next/server";
import { getOrderedRows, upsert } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getOrderedRows("tickets", 1000));
}

export async function POST(req: Request) {
  const { id, data } = await req.json();
  upsert("tickets", id, data);
  return NextResponse.json({ ok: true });
}
