import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH, type PortalArea } from "@/lib/auth/portal";
import type { Database } from "@/types/database";

import { supabaseEnv } from "./env";

function protectedArea(pathname: string): PortalArea | null {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return "admin";
  if (pathname === "/jemaat" || pathname.startsWith("/jemaat/")) return "jemaat";
  return null;
}

/**
 * Refreshes the Supabase session cookie on every request and sends a
 * request without a session to its area's login page with ?next={path}:
 * /admin → /login (brief §6), /jemaat → /portal/masuk (stage 11f).
 * Pages still verify the user and their access themselves; this is not the
 * security boundary.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = supabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Don't put code between createServerClient and getClaims(): it refreshes the token.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims);

  const area = protectedArea(request.nextUrl.pathname);
  if (!signedIn && area) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH[area];
    loginUrl.search = "";
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);

    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
