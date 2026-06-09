import { describe, expect, it } from "vitest";
import {
  decryptJsonSecret,
  decryptSecret,
  encryptJsonSecret,
  encryptSecret,
  isEncryptedSecret,
  SecretEncryptionError,
} from "./secrets";

const KEY = "test-encryption-key-with-at-least-32-chars";
const OTHER_KEY = "other-encryption-key-with-at-least-32-chars";

describe("secret encryption", () => {
  it("encrypts and decrypts string secrets", () => {
    const encrypted = encryptSecret("garmin-session-token", KEY);

    expect(encrypted).not.toBe("garmin-session-token");
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(decryptSecret(encrypted, KEY)).toBe("garmin-session-token");
  });

  it("uses a fresh IV for every encryption", () => {
    const first = encryptSecret("same-secret", KEY);
    const second = encryptSecret("same-secret", KEY);

    expect(first).not.toBe(second);
    expect(decryptSecret(first, KEY)).toBe("same-secret");
    expect(decryptSecret(second, KEY)).toBe("same-secret");
  });

  it("rejects missing or too short keys", () => {
    expect(() => encryptSecret("secret", "short")).toThrow(SecretEncryptionError);
    expect(() => decryptSecret("ptc:v1:a:b:c", "short")).toThrow(SecretEncryptionError);
  });

  it("rejects malformed ciphertext", () => {
    expect(isEncryptedSecret("plain")).toBe(false);
    expect(() => decryptSecret("plain", KEY)).toThrow(SecretEncryptionError);
  });

  it("rejects ciphertext encrypted with a different key", () => {
    const encrypted = encryptSecret("sensitive", KEY);

    expect(() => decryptSecret(encrypted, OTHER_KEY)).toThrow(SecretEncryptionError);
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptSecret("sensitive", KEY);
    const tampered = encrypted.replace(/.$/, (char) => (char === "A" ? "B" : "A"));

    expect(() => decryptSecret(tampered, KEY)).toThrow(SecretEncryptionError);
  });

  it("encrypts and decrypts JSON-compatible secret payloads", () => {
    const payload = {
      provider: "garmin_unofficial",
      session: {
        token: "abc",
        expiresAt: "2026-06-09T12:00:00.000Z",
      },
    };

    const encrypted = encryptJsonSecret(payload, KEY);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(decryptJsonSecret(encrypted, KEY)).toEqual(payload);
  });
});
