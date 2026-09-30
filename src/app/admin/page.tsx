import { CircleAlertIcon, ShieldAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { WartaStatusBadge } from "@/components/warta/warta-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can } from "@/lib/auth/permissions";
import { displayName, requireUser } from "@/lib/auth/session";
import { formatDateLong, weekContaining } from "@/lib/dates";
import { formatRupiah } from "@/lib/format";
import { formatJam } from "@/lib/peribadahan";
import { loadPeribadahanRange } from "@/lib/peribadahan-routes";
import { loadSaranaDanaOverview } from "@/lib/sarana-dana-routes";
import { createClient } from "@/lib/supabase/server";
import { loadLatestWarta } from "@/lib/warta-routes";

export const metadata: Metadata = { title: "Dashboard" };

function SummaryError() {
  return (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      Gagal memuat ringkasan ini. Muat ulang halaman untuk mencoba lagi.
    </p>
  );
}

const linkClass = "text-sm font-medium text-primary underline-offset-4 hover:underline";

/**
 * Brief §9.3: greeting, roles, permission count, and read-only summaries for
 * users who can read church content (`warta:read`). §12.8: the forbidden notice.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, { error }] = await Promise.all([requireUser(), searchParams]);
  const canRead = can(user, "warta", "read");

  const week = weekContaining();
  let summaries: {
    schedule: Awaited<ReturnType<typeof loadPeribadahanRange>>;
    latest: Awaited<ReturnType<typeof loadLatestWarta>>;
    balances: Awaited<ReturnType<typeof loadSaranaDanaOverview>>;
  } | null = null;
  if (canRead) {
    const supabase = await createClient();
    const [schedule, latest, balances] = await Promise.all([
      loadPeribadahanRange(supabase, week),
      loadLatestWarta(supabase),
      loadSaranaDanaOverview(supabase),
    ]);
    for (const [name, result] of Object.entries({ schedule, latest, balances })) {
      if (result.error) console.error(`[/admin] Failed to load ${name}:`, result.error);
    }
    summaries = { schedule, latest, balances };
  }

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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Akses kamu</h2>
            </CardTitle>
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

        {summaries && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Warta terbaru</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {summaries.latest.error ? (
                <SummaryError />
              ) : summaries.latest.data ? (
                <>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{summaries.latest.data.judulKebaktian}</span>
                      <WartaStatusBadge status={summaries.latest.data.status} />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDateLong(summaries.latest.data.tanggalKebaktian)}
                    </span>
                  </div>
                  <Link href={`/admin/warta/${summaries.latest.data.id}`} className={linkClass}>
                    Buka warta
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Belum ada warta.</p>
                  {can(user, "warta", "create") && (
                    <Link href="/admin/warta/new" className={linkClass}>
                      Buat Warta Baru
                    </Link>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {summaries && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Jadwal minggu ini</h2>
              </CardTitle>
              <CardDescription>
                {formatDateLong(week.start)} – {formatDateLong(week.end)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {summaries.schedule.error || !summaries.schedule.data ? (
                <SummaryError />
              ) : summaries.schedule.data.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada jadwal minggu ini.</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {summaries.schedule.data.rows.map((row) => (
                    <li key={row.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                      <span className="font-medium">{row.categoryName}</span>
                      <span className="text-sm text-muted-foreground">
                        {formatDateLong(row.tanggal)}
                        {row.jam && `, ${formatJam(row.jam)}`}
                        {row.tempatNama && ` · ${row.tempatNama}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/admin/peribadahan" className={linkClass}>
                Lihat semua jadwal
              </Link>
            </CardContent>
          </Card>
        )}

        {summaries && (
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Saldo Sarana & Dana</h2>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summaries.balances.error || !summaries.balances.data ? (
                <SummaryError />
              ) : (
                <dl className="flex flex-col divide-y">
                  {summaries.balances.data.map((item) => (
                    <div key={item.id} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
                      <dt>
                        <Link href={`/admin/sarana-dana/${item.key}`} className="hover:underline">
                          {item.name}
                        </Link>
                      </dt>
                      <dd className="font-mono tabular-nums">{formatRupiah(item.saldo)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
