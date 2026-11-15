import { NextResponse } from "next/server";
import { authed } from "@/lib/http";
import { sendMailSchema } from "@/lib/validation";
import { getMailbox, MailError, sendMail } from "@/lib/mail";

const MAX_FILES = 10;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const list = (v: FormDataEntryValue | null) => (typeof v === "string" ? v.split(/[,;\s]+/).filter(Boolean) : []);

/** Accepts multipart/form-data (to, cc, subject, text, files[]) so attachments can be sent. */
export const POST = authed(async (req, actor) => {
  const fd = await req.formData().catch(() => null);
  if (!fd) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  const parsed = sendMailSchema.safeParse({
    to: list(fd.get("to")),
    cc: list(fd.get("cc")),
    subject: (fd.get("subject") as string) ?? "",
    text: (fd.get("text") as string) ?? "",
  });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (files.length > MAX_FILES) return NextResponse.json({ error: `Attach at most ${MAX_FILES} files` }, { status: 400 });
  if (files.reduce((n, f) => n + f.size, 0) > MAX_TOTAL_BYTES) return NextResponse.json({ error: "Attachments exceed 20 MB in total" }, { status: 413 });

  try {
    const attachments = await Promise.all(files.map(async (f) => ({ filename: f.name, content: Buffer.from(await f.arrayBuffer()), contentType: f.type || undefined })));
    await sendMail(await getMailbox(actor.id), { ...parsed.data, attachments });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof MailError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
