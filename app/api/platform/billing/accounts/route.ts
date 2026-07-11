import { NextRequest, NextResponse } from "next/server";

import { requireSuperAdmin } from "@/lib/platform/server";
import { listBillingAccountsWithOrganization } from "@/lib/billing/repository";
import { getOutstandingBalanceForBillingAccount } from "@/lib/billing/invoice-service";

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth.error) return auth.error;

  const accounts = await listBillingAccountsWithOrganization();
  const enriched = await Promise.all(
    accounts.map(async (account) => {
      const { outstandingAmount, outstandingInvoiceIds } = await getOutstandingBalanceForBillingAccount(account.id);
      return { ...account, outstanding_amount: outstandingAmount, outstanding_invoice_count: outstandingInvoiceIds.length };
    })
  );

  return NextResponse.json({ success: true, accounts: enriched });
}
