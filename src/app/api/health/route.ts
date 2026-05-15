import { NextResponse } from "next/server";

export async function GET() {
  const ciscoApiMode =
    (process.env.CISCO_API_MODE || "mock") === "live" ? "live" : "mock";
  return NextResponse.json({
    ciscoApiMode,
    timestamp: new Date().toISOString(),
  });
}
