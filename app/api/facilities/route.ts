import { NextResponse } from "next/server";
import { getAllRows, upsert } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getAllRows("facility_state"));
}

export async function POST(req: Request) {
  const { id, data } = await req.json();
  upsert("facility_state", id, data);
  return NextResponse.json({ ok: true });
}
