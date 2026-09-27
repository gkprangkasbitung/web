/**
 * Runs route handlers in-process against the local Supabase stack, as a real
 * signed-in user: `next/headers` is backed by a cookie jar filled by a real
 * password sign-in. Refuses to run unless the stack is on 127.0.0.1.
 */
import { execSync } from "node:child_process";

import { createServerClient } from "@supabase/ssr";
import { vi } from "vitest";

import type { Database } from "@/types/database";

export const CLIENT_IP = "203.0.113.42";
export const PASSWORD = "password123";

function localStackEnv(): { url: string; anonKey: string } {
  const output = execSync("pnpm supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const read = (key: string) => output.match(new RegExp(`^${key}="?([^"\\r\\n]*)"?`, "m"))?.[1];
  const url = read("API_URL");
  const anonKey = read("ANON_KEY");
  if (!url || !anonKey) throw new Error("Local Supabase stack isn't running (pnpm supabase start).");
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error(`Refusing to run integration tests against ${url}; only the local stack is allowed.`);
  }
  return { url, anonKey };
}

export const env = localStackEnv();
process.env.NEXT_PUBLIC_SUPABASE_URL = env.url;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.anonKey;

type Jar = Map<string, string>;
let currentJar: Jar = new Map();

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
  headers: async () => new Headers({ "x-forwarded-for": `${CLIENT_IP}, 10.0.0.1` }),
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
export async function signIn(email: string): Promise<Session> {
  const jar: Jar = new Map();
  const supabase = jarClient(jar);
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
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
  { method, body, params = {} }: { method: string; body?: unknown; params?: Record<string, string> },
) {
  const request = new Request("http://localhost/api/test", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const response = await handler(request, { params: Promise.resolve(params) });
  return { status: response.status, body: (await response.json()) as { data?: never; error?: string } };
}
