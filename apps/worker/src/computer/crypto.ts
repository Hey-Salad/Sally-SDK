// Crypto helpers for computer-agent provisioning. Raw codes and tokens are
// returned to the caller exactly once; only SHA-256 hashes are persisted.

const PAIRING_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generatePairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let code = "";
  for (const [index, byte] of bytes.entries()) {
    if (index === 4) {
      code += "-";
    }
    code += PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length];
  }
  return code;
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

export function normalizePairingCode(code: string): string {
  return code.trim().toUpperCase();
}

export function connectSignaturePayload(agentId: string, timestamp: number): string {
  return `sally-connect:${agentId}:${timestamp}`;
}

export async function verifyEd25519Signature(
  publicKeySpkiBase64: string,
  payload: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "spki",
      base64Decode(publicKeySpkiBase64),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      base64Decode(signatureBase64),
      new TextEncoder().encode(payload)
    );
  } catch {
    return false;
  }
}

function base64Decode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
