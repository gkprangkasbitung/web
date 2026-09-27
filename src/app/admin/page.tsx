import { ShieldAlertIcon } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/admin/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName, requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, { error }] = await Promise.all([requireUser(), searchParams]);

  return (
    <div className="flex flex-col gap-6">
      {error === "forbidden" && (
        <Alert>
          <ShieldAlertIcon aria-hidden="true" />
          <AlertTitle>Akses ditolak</AlertTitle>
          <AlertDescription>Kamu tidak punya akses ke halaman yang tadi kamu buka.</AlertDescription>
        </Alert>
      )}

      <PageHeader title="Dashboard" description={`Selamat datang, ${displayName(user)}.`} />

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Akses kamu</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Role</span>
            <div className="flex flex-wrap gap-1.5">
              {user.roles.length > 0 ? (
                user.roles.map((role) => (
                  <Badge key={role.id} variant="accent">
                    {role.name}
                  </Badge>
                ))
              ) : (
                <Badge variant="neutral">Tanpa role</Badge>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Jumlah permission</span>
            <span className="text-2xl font-semibold tracking-tight tabular-nums">{user.permissions.length}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
