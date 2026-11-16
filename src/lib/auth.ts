import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyToken } from "./jwt";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

/**
 * Resolves the caller from the Bearer token, re-reading the user from the DB so
 * promotions / deactivations take effect immediately.
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const payload = verifyToken(header.slice(7));
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/** `code` lets the browser tell a genuinely invalid session apart from any other 401-ish failure. */
export const unauthorized = () => NextResponse.json({ error: "Unauthorized", code: "SESSION_INVALID" }, { status: 401 });
export const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });
export const notFound = (what = "Not found") => NextResponse.json({ error: what }, { status: 404 });
export const badRequest = (error: unknown) => NextResponse.json({ error }, { status: 400 });
export const conflict = (error: string, extra: object = {}) => NextResponse.json({ error, ...extra }, { status: 409 });
