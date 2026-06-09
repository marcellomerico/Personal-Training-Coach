import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { loadEnv } from "./env";

const FORMAT_PREFIX = "ptc:v1";
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

export class SecretEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretEncryptionError";
  }
}

function resolveKeyMaterial(key = loadEnv().ENCRYPTION_KEY): Buffer {
  if (!key || key.length < 32) {
    throw new SecretEncryptionError(
      "ENCRYPTION_KEY muss gesetzt sein und mindestens 32 Zeichen haben.",
    );
  }

  // Stable 32-byte key material. The env value stays an operational secret; we
  // never persist or log it.
  return createHash("sha256").update(key).digest();
}

function encode(buf: Buffer): string {
  return buf.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

/** True, wenn der Wert nach dem aktuellen Secret-Format verschluesselt aussieht. */
export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${FORMAT_PREFIX}:`);
}

/** Verschluesselt einen String fuer die Speicherung in Token-/Secret-DB-Feldern. */
export function encryptSecret(plainText: string, key?: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolveKeyMaterial(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [FORMAT_PREFIX, encode(iv), encode(authTag), encode(ciphertext)].join(":");
}

/** Entschluesselt einen String aus einem Token-/Secret-DB-Feld. */
export function decryptSecret(encrypted: string, key?: string): string {
  const [prefix, version, ivRaw, authTagRaw, ciphertextRaw] = encrypted.split(":");
  if (`${prefix}:${version}` !== FORMAT_PREFIX || !ivRaw || !authTagRaw || !ciphertextRaw) {
    throw new SecretEncryptionError("Ungueltiges Secret-Format.");
  }

  const iv = decode(ivRaw);
  const authTag = decode(authTagRaw);
  const ciphertext = decode(ciphertextRaw);

  const decipher = createDecipheriv(ALGORITHM, resolveKeyMaterial(key), iv);
  decipher.setAuthTag(authTag);

  try {
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString("utf8");
  } catch (err) {
    if (err instanceof SecretEncryptionError) throw err;
    throw new SecretEncryptionError("Secret konnte nicht entschluesselt werden.");
  }
}

/** Verschluesselt ein JSON-kompatibles Secret-Objekt. */
export function encryptJsonSecret(value: unknown, key?: string): string {
  return encryptSecret(JSON.stringify(value), key);
}

/** Entschluesselt ein JSON-kompatibles Secret-Objekt. */
export function decryptJsonSecret<T = unknown>(encrypted: string, key?: string): T {
  return JSON.parse(decryptSecret(encrypted, key)) as T;
}
