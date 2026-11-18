import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authed } from "@/lib/http";
import { badRequest, notFound } from "@/lib/auth";
import { projectAccess } from "@/lib/project-access";
import { fmtPalNo, parsePalNo } from "@/lib/pal-no";

/** ?q=PAL-0012 → the task or request with that number, if the caller may see it. */
export const GET = authed(async (req, actor) => {
  const no = parsePalNo(new URL(req.url).searchParams.get("q"));
  if (!no) return badRequest("Enter a PAL number, e.g. PAL-0012");
  const missing = () => notFound(`${fmtPalNo(no)} not found`);

  const task = await prisma.task.findUnique({ where: { palNo: no }, select: { id: true, title: true, projectId: true } });
  if (task) {
    const access = await projectAccess(task.projectId, actor);
    return access?.canView ? NextResponse.json({ kind: "task", id: task.id, title: task.title, palNo: no, href: `/tasks?open=${task.id}` }) : missing();
  }
  const r = await prisma.serviceRequest.findUnique({ where: { palNo: no }, select: { id: true, title: true, requesterId: true, assigneeId: true } });
  if (r) {
    const seesAll = actor.role === "SUPER_ADMIN" || actor.role === "COMPANY_HEAD";
    return seesAll || r.requesterId === actor.id || r.assigneeId === actor.id
      ? NextResponse.json({ kind: "request", id: r.id, title: r.title, palNo: no, href: `/requests?open=${r.id}` })
      : missing();
  }
  return missing();
});
