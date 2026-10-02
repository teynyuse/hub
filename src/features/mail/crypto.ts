import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  const result = Buffer.from(value ?? "", "base64");
  if (result.length !== 32)
    throw new Error("TOKEN_ENCRYPTION_KEY moet 32 bytes zijn, gecodeerd als base64.");
  return result;
}
export function encryptToken(token: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(userId));
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decryptToken(value: string, userId: string) {
  const data = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}
