import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Centered card used by /login and /auth/set-password. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4">
        <ThemeSwitcher />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:items-center sm:pt-0">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <p className="text-sm font-semibold text-primary">GKP Rangkasbitung</p>
            <CardTitle>
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
