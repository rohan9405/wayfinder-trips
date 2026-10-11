import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

const GUEST_COOKIE = "wf_guest";
const ADMIN_COOKIE = "wf_admin";
const localSecret = randomBytes(32).toString("hex");

function secret() {
  return process.env.SESSION_SECRET || localSecret;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function cookie(req: Request, name: string) {
  const match = req.headers.get("cookie")?.split("; ").find((part) => part.startsWith(`${name}=`));
  return match?.slice(name.length + 1);
}

function serialize(name: string, value: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function adminEnabled() {
  return Boolean(process.env.ADMIN_PASSWORD && (process.env.SESSION_SECRET?.length ?? 0) >= 32);
}

export function validAdminPassword(password: string) {
  return adminEnabled() && equal(password, process.env.ADMIN_PASSWORD!);
}

export function isAdmin(req: Request) {
  if (!adminEnabled()) return false;
  const raw = cookie(req, ADMIN_COOKIE);
  if (!raw) return false;
  const [expires, signature] = raw.split(".");
  return Boolean(expires && signature && Number(expires) > Date.now() && equal(signature, sign(`admin.${expires}`)));
}

export function guestSession(req: Request) {
  const raw = cookie(req, GUEST_COOKIE);
  if (raw) {
    const [id, signature] = raw.split(".");
    if (id && /^[a-f0-9-]{36}$/.test(id) && signature) {
      if (equal(signature, sign(`guest.${id}`))) return { id, setCookie: null as string | null };
      // Keep guest IDs stable when moving from the old ADMIN_TOKEN signing key.
      const legacy = process.env.ADMIN_TOKEN;
      if (legacy && equal(signature, createHmac("sha256", legacy).update(`guest.${id}`).digest("hex"))) {
        return { id, setCookie: serialize(GUEST_COOKIE, `${id}.${sign(`guest.${id}`)}`, 365 * 86_400) };
      }
    }
  }
  const id = randomUUID();
  return { id, setCookie: serialize(GUEST_COOKIE, `${id}.${sign(`guest.${id}`)}`, 365 * 86_400) };
}

export function identity(req: Request) {
  const guest = guestSession(req);
  const admin = isAdmin(req);
  return {
    role: admin ? "admin" as const : "guest" as const,
    owner: admin ? "admin" : `guest:${guest.id}`,
    guestId: guest.id,
    guestLabel: `Guest ${guest.id.slice(0, 8).toUpperCase()}`,
    setCookie: guest.setCookie,
  };
}

export function adminCookie() {
  const expires = Date.now() + 7 * 86_400_000;
  return serialize(ADMIN_COOKIE, `${expires}.${sign(`admin.${expires}`)}`, 7 * 86_400);
}

export function clearAdminCookie() {
  return serialize(ADMIN_COOKIE, "", 0);
}
