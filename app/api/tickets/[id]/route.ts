import { NextResponse } from "next/server";
import { deleteRow } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  deleteRow("tickets", params.id);
  return NextResponse.json({ ok: true });
}
