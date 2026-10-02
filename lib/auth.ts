import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import db from "./db";

export type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  disabled: number;
};
export function hashPassword(
  password: string,
  salt = crypto.randomBytes(16).toString("hex")
) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex"),
    b = crypto.scryptSync(password, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function sessionUser(): Promise<User | null> {
  const token = (await cookies()).get("jts_session")?.value;
  if (!token) return null;
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return (
    (db
      .prepare(
        `SELECT u.id,u.email,u.name,u.role,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND datetime(s.expires_at)>datetime('now') AND u.disabled=0`
      )
      .get(tokenHash) as User) || null
  );
}
export async function requireUser() {
  const u = await sessionUser();
  if (!u) redirect("/login");
  return u;
}
export async function requireAdmin() {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/dashboard");
  return u;
}
export async function apiUser() {
  return sessionUser();
}
export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString("base64url");
  const h = crypto.createHash("sha256").update(token).digest("hex");
  db.prepare(
    `INSERT INTO sessions(user_id,token_hash,created_at,expires_at) VALUES(?,?,datetime('now'),datetime('now','+30 days'))`
  ).run(userId, h);
  (await cookies()).set("jts_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: 2592000,
  });
}
export async function logout() {
  const c = await cookies();
  const token = c.get("jts_session")?.value;
  if (token) {
    const h = crypto.createHash("sha256").update(token).digest("hex");
    db.prepare("DELETE FROM sessions WHERE token_hash=?").run(h);
  }
  c.delete("jts_session");
}
