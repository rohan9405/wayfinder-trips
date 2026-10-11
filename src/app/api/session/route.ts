import { adminCookie, adminEnabled, clearAdminCookie, identity, validAdminPassword } from "@/lib/guest-session";

export const runtime = "nodejs";

function withGuestCookie(response: Response, value: string | null) {
  if (value) response.headers.append("Set-Cookie", value);
  return response;
}

export async function GET(req: Request) {
  const session = identity(req);
  return withGuestCookie(Response.json({ role: session.role, guestLabel: session.guestLabel, adminAvailable: adminEnabled() }, {
    headers: { "Cache-Control": "no-store" },
  }), session.setCookie);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { password?: unknown };
  if (!adminEnabled()) return Response.json({ error: "Admin sign-in is not configured." }, { status: 503 });
  if (typeof body.password !== "string" || !validAdminPassword(body.password)) {
    return Response.json({ error: "Invalid admin password." }, { status: 401 });
  }
  const session = identity(req);
  const response = Response.json({ role: "admin", guestLabel: session.guestLabel, adminAvailable: true }, {
    headers: { "Cache-Control": "no-store" },
  });
  response.headers.append("Set-Cookie", adminCookie());
  return withGuestCookie(response, session.setCookie);
}

export async function DELETE(req: Request) {
  const session = identity(req);
  const response = Response.json({ role: "guest", guestLabel: session.guestLabel, adminAvailable: adminEnabled() }, {
    headers: { "Cache-Control": "no-store" },
  });
  response.headers.append("Set-Cookie", clearAdminCookie());
  return withGuestCookie(response, session.setCookie);
}
