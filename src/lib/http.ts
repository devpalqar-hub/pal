import { NextResponse } from "next/server";
import type { z } from "zod";
import { getAuthUser, unauthorized, type AuthUser } from "./auth";

type Ctx<P> = { params: Promise<P> };

/** Wraps a route handler: authenticates the caller and turns thrown errors into 500s. */
export function authed<P = Record<string, never>>(
  handler: (req: Request, user: AuthUser, params: P) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>) => {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    try {
      return await handler(req, user, await ctx.params);
    } catch (e) {
      console.error(e);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { error: Response }> {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return { error: NextResponse.json({ error: parsed.error.flatten() }, { status: 400 }) };
  }
  return { data: parsed.data };
}

export const parseId = (v: string) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
