// Capability and command policy for computer agents.
// Agents start with a read-only capability set; anything outside it is denied.

export const DEFAULT_AGENT_CAPABILITIES = [
  "computer.status",
  "computer.health",
  "repo.status"
] as const;

const SECRET_PATTERNS: RegExp[] = [
  /private\s*key/i,
  /secret/i,
  /password/i,
  /passphrase/i,
  /credential/i,
  /api[\s_-]?key/i,
  /auth[\s_-]?token/i,
  /bearer\s+[a-z0-9._-]+/i,
  /\.ssh\b/i,
  /id_(rsa|ed25519|ecdsa|dsa)/i,
  /keychain/i,
  /\.env\b/i,
  /wallet/i,
  /seed\s*phrase/i,
  /mnemonic/i,
  /\.aws\b/i,
  /\.npmrc\b/i,
  /\.netrc\b/i
];

const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-z]*[rf][a-z]*\s+)+/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /:\s*\(\)\s*\{\s*:\s*\|\s*:/,
  /\bchmod\s+(-[a-z]+\s+)*777\b/i,
  /\bcurl\b[^|]*\|\s*(ba)?sh\b/i,
  /\bwget\b[^|]*\|\s*(ba)?sh\b/i,
  /\bgit\s+push\s+.*--force/i,
  /\bdiskutil\s+erase/i,
  /\bkillall\b/i
];

const EXFILTRATION_PATTERNS: RegExp[] = [
  /\bscp\b/i,
  /\brsync\b[^|]*\b[a-z0-9.-]+:/i,
  /\bnc\s+(-[a-z]+\s+)*[a-z0-9.-]+\s+\d+/i,
  /\bbase64\b[^|]*\|\s*curl/i,
  /\bcat\b[^|]*\|\s*(curl|nc|wget)/i
];

export interface CommandPolicyDenial {
  reason: string;
  category: "secret" | "destructive" | "exfiltration";
}

export function evaluateCommandPolicy(command: string): CommandPolicyDenial | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(command)) {
      return { category: "secret", reason: "Command references secrets or private key material" };
    }
  }
  for (const pattern of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(command)) {
      return { category: "destructive", reason: "Command matches a destructive shell pattern" };
    }
  }
  for (const pattern of EXFILTRATION_PATTERNS) {
    if (pattern.test(command)) {
      return { category: "exfiltration", reason: "Command matches a data-exfiltration pattern" };
    }
  }
  return null;
}
