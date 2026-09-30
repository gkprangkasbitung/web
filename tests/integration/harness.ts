/**
 * Runs route handlers in-process against the local Supabase stack, as a real
 * signed-in user: `next/headers` is backed by a cookie jar filled by a real
 * password sign-in. Refuses to run unless the stack is on 127.0.0.1.
 */
import { execSync } from "node:child_process";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { vi } from "vitest";

import type { Database } from "@/types/database";

export const CLIENT_IP = "203.0.113.42";
export const PASSWORD = "password123";

function localStackEnv(): { url: string; anonKey: string; serviceKey: string } {
  const output = execSync("pnpm supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const read = (key: string) => output.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?`, "m"))?.[1];
  const url = read("API_URL");
  const anonKey = read("ANON_KEY");
  const serviceKey = read("SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase stack isn't running (pnpm supabase start).");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error(`Refusing to run integration tests against ${url}; only the local stack is allowed.`);
  }
  return { url, anonKey, serviceKey };
}

export const env = localStackEnv();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;
// Local stack only (checked above): invites and account deletion need it.
process.env.SUPABASE_SERVICE_ROLE_KEY = env.serviceKey;
// Matches site_url in supabase/config.toml.
process.env.SITE_URL = "http://127.0.0.1:3000";

type Jar = Map<string, string>;
let currentJar: Jar = new Map();
let extraHeaders: Record<string, string> = {};

/** Extra request headers seen by next/headers (e.g. a forged Host); reset with {}. */
export function setRequestHeaders(headers: Record<string, string>) {
  extraHeaders = headers;
}

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...currentJar].map(([name, value]) => ({ name, value })),
    get: (name: string) => (currentJar.has(name) ? { name, value: currentJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      currentJar.set(name, value);
    },
  }),
  headers: async () => new Headers({ "x-forwarded-for": `${CLIENT_IP}, 10.0.0.1`, ...extraHeaders }),
}));

function jarClient(jar: Jar) {
  return createServerClient<Database>(env.url, env.anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
}

export type Session = { jar: Jar; supabase: ReturnType<typeof jarClient> };

/** Signs in a seeded user (supabase/seed.sql) and returns their cookie jar and client. */
export async function signIn(email: string, password = PASSWORD): Promise<Session> {
  const jar: Jar = new Map();
  const supabase = jarClient(jar);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  return { jar, supabase };
}

/** Makes the route handlers see this session (or none). */
export function actAs(session: Session | null) {
  currentJar = session?.jar ?? new Map();
}

type Handler = (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Calls a route handler and returns the status and parsed JSON body. */
export async function call(
  handler: Handler,
  {
    method,
    body,
    params = {},
    headers = {},
  }: { method: string; body?: unknown; params?: Record<string, string>; headers?: Record<string, string> },
) {
  const request = new Request("http://localhost/api/test", {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) });
  return { status: response.status, body: (await response.json()) as { data?: never; error?: string } };
}

/** Like `call`, with a multipart body (photo uploads). */
export async function callForm(
  handler: Handler,
  { method, form, params = {} }: { method: string; form: FormData; params?: Record<string, string> },
) {
  const request = new Request("http://localhost/api/test", { method, body: form });
  const response = await handler(request, { params: Promise.resolve(params) });
  return { status: response.status, body: (await response.json()) as { data?: never; error?: string } };
}

/** Service-role client for the local stack only: throwaway users and fixtures. */
export function serviceClient() {
  return createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Creates a confirmed throwaway user with the given role names; returns their id. */
export async function createTestUser(email: string, password: string, roleNames: string[] = []): Promise<string> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  if (roleNames.length > 0) {
    const roles = await admin.from("roles").select("id, name").in("name", roleNames);
    if (roles.error) throw roles.error;
    const insert = await admin.from("user_roles").insert(roles.data.map((r) => ({ user_id: data.user.id, role_id: r.id })));
    if (insert.error) throw insert.error;
  }
  return data.user.id;
}

/** Mailpit (local stack): the newest message sent to `to`, or null. */
export async function latestMail(to: string): Promise<{ html: string; subject: string } | null> {
  const base = "http://127.0.0.1:54324/api/v1";
  const search = await fetch(`${base}/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  const list = (await search.json()) as { messages?: { ID: string }[] };
  const id = list.messages?.[0]?.ID;
  if (!id) return null;
  const message = (await (await fetch(`${base}/message/${id}`)).json()) as { HTML: string; Subject: string };
  return { html: message.HTML, subject: message.Subject };
}
