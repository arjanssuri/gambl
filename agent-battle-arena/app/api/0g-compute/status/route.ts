import { NextResponse } from "next/server";
import { getZeroGClient } from "@/lib/0g-compute";

export const runtime = "nodejs";

export async function GET() {
  try {
    const zg = getZeroGClient();
    const [stats, providers] = await Promise.all([
      zg.getNetworkStats(),
      zg.getProviders(),
    ]);

    return NextResponse.json({
      status: "ok",
      connected: zg.isConnected(),
      network: stats,
      providers: providers.slice(0, 5),
      recentInferences: zg.getInferenceLog().slice(0, 10),
    });
  } catch (err: any) {
    return NextResponse.json(
      { status: "error", error: err?.message || "Failed to fetch 0G status" },
      { status: 500 }
    );
  }
}
