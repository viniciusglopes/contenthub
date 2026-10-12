import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { publicAccount } from "@/lib/instagram/accounts";
import { connectedAccounts, handle, loadInsightData } from "@/lib/instagram/data";
import { mockEnabled } from "@/lib/instagram/mock";
import { buildDashboard } from "@/lib/instagram/stats";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await connectDB();
    const project = req.nextUrl.searchParams.get("project");
    const accountId = req.nextUrl.searchParams.get("account");
    const accounts = await connectedAccounts({ project });
    const account = accounts.find((a) => String(a._id) === accountId) || accounts[0];
    if (!account) return NextResponse.json({ account: null, accounts: [], dashboard: null, demo: mockEnabled() });
    const { daily, media } = await loadInsightData(account._id);
    return NextResponse.json({
      account: publicAccount(account),
      accounts: accounts.map(publicAccount),
      dashboard: buildDashboard(daily, media),
      demo: mockEnabled(),
    });
  });
}
