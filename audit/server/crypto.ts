import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { encryptionKey } from "./config.ts";
const key = createHash("sha256").update(encryptionKey).digest();
export function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body]
    .map((b) => b.toString("base64url"))
    .join(".");
}
export function unseal<T>(value: string): T {
  const [iv, tag, body] = value
    .split(".")
    .map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([cipher.update(body), cipher.final()]).toString("utf8"),
  );
}
export const hash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
