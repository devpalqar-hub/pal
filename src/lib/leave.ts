import { prisma } from "./prisma";
import { istYear } from "./time";

const DAY = 86_400_000;

/** Working days between two date-only values (inclusive), based on the user's schedule (default Mon–Fri). */
export function countWorkingDays(start: Date, end: Date, workingDays: number[] = [1, 2, 3, 4, 5]) {
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    if (workingDays.includes(new Date(t).getUTCDay())) n++;
  }
  return n;
}

/** Paid-leave balance for a year: quota + add-ons, minus approved and still-pending paid requests. */
export async function leaveBalance(userId: number, year = istYear()) {
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  const [schedule, addOns, reqs] = await Promise.all([
    prisma.workSchedule.findUnique({ where: { userId } }),
    prisma.leaveAddOn.findMany({ where: { userId, year } }),
    prisma.leaveRequest.findMany({
      where: { userId, type: "PAID", status: { in: ["APPROVED", "PENDING"] }, startDate: { gte: from, lte: to } },
      select: { status: true, days: true },
    }),
  ]);
  const base = schedule?.paidLeavesPerYear ?? 0;
  const addOnDays = addOns.reduce((n, a) => n + a.days, 0);
  const used = reqs.filter((r) => r.status === "APPROVED").reduce((n, r) => n + r.days, 0);
  const pending = reqs.filter((r) => r.status === "PENDING").reduce((n, r) => n + r.days, 0);
  const total = base + addOnDays;
  return { year, base, addOnDays, totalPaidLeaves: total, used, pending, remaining: total - used - pending };
}
