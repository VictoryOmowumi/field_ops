import Link from "next/link";

import AuthSplitLayout from "@/components/auth/AuthSplitLayout";
import { Button } from "@/components/ui/button";

export default function NoAccessPage() {
  return (
    <AuthSplitLayout
      title="No access"
      description="Your account does not have permission for this workspace route."
      footer={
        <Button className="rounded-xl" asChild>
          <Link href="/login">Go to Login</Link>
        </Button>
      }
    >
      <div className="rounded-2xl border border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
        Contact your administrator if you think this is a mistake.
      </div>
    </AuthSplitLayout>
  );
}
