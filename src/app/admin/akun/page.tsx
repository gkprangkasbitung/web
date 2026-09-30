import type { Metadata } from "next";

import { PasswordForm } from "@/components/account/password-form";
import { ProfileForm } from "@/components/account/profile-form";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Profil Saya" };

/** Profil Saya (brief §9.14): open to every signed-in user. */
export default async function Page() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profil Saya" description="Nama yang tampil di admin dan password untuk masuk." />

      <div className="grid max-w-3xl grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Akun</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{user.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="flex flex-wrap gap-1.5">
                {user.roles.length === 0 ? (
                  <Badge variant="neutral">Tanpa role</Badge>
                ) : (
                  user.roles.map((role) => (
                    <Badge key={role.id} variant="accent">
                      {role.name}
                    </Badge>
                  ))
                )}
              </dd>
            </dl>
            <ProfileForm fullName={user.fullName} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ganti Password</CardTitle>
            <CardDescription>Setelah password diganti, akun ini otomatis keluar dari perangkat lain.</CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordForm />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
