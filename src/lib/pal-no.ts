import { prisma } from "./prisma";

/** Next number in the company-wide PAL-NO sequence (shared by tasks and requests). Race-free: AUTO_INCREMENT issues it. */
export async function nextPalNo(kind: "TASK" | "REQUEST") {
  return (await prisma.palNumber.create({ data: { kind } })).id;
}

export const fmtPalNo = (n: number) => `PAL-${String(n).padStart(4, "0")}`;

/** "PAL-0012", "pal 12", "PAL12", "#12" or "12" → 12. Anything else → null. */
export function parsePalNo(q: string | null | undefined): number | null {
  const m = q?.trim().match(/^(?:pal[\s\-_#]*|#)?0*(\d{1,9})$/i);
  return m ? Number(m[1]) : null;
}
