import type { Role } from "@prisma/client";
import jwt, { type SignOptions } from "jsonwebtoken";

export interface JwtPayload {
  sub: number;
  email: string;
  role: Role;
}

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return s;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), {
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "1d") as SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, secret());
    return typeof decoded === "string" ? null : (decoded as unknown as JwtPayload);
  } catch {
    return null;
  }
}
