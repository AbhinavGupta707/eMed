import { createHash, createHmac, randomBytes } from "node:crypto";

import type { CompanionCryptoPort } from "../../../../../packages/companion/src/index";

function hmac(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}\u001f${value}`).digest("base64url");
}

export class NodeCompanionCrypto implements CompanionCryptoPort {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("The companion token key must contain at least 32 bytes.");
    }
  }

  issuePairingToken(): string {
    return `cpt1_${randomBytes(32).toString("base64url")}`;
  }

  deriveSessionToken(sessionId: string): string {
    return `cst1_${hmac(this.secret, "session-token", sessionId)}`;
  }

  hashToken(purpose: "pairing" | "session", token: string): string {
    return hmac(this.secret, `${purpose}-hash`, token);
  }

  hashValue(purpose: "exchange" | "device", value: string): string {
    return hmac(this.secret, `${purpose}-value`, value);
  }

  fingerprint(value: unknown): string {
    return createHash("sha256").update(JSON.stringify(value)).digest("base64url");
  }
}

export function deriveCompanionSecret(source?: string): string {
  const seed = source ?? randomBytes(32).toString("base64url");
  return createHash("sha256").update(`homerounds-companion\u001f${seed}`).digest("base64url");
}
