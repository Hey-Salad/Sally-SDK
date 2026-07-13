# NPM publish status — @heysalad/sally 0.1.1 & @heysalad/sally-sdk 0.1.1

_Last updated: 2026-07-12_

## Current blocker

`pnpm publish --access public --no-git-checks` (run in `packages/sdk`) fails with:

```
npm error code EOTP
This operation requires a one-time password from your authenticator.
```

- NPM auth itself works: `npm whoami` → `chilu22`, registry `https://registry.npmjs.org/`.
- No OTP arrives by email, so the account uses **app-based 2FA (TOTP)** — the code must
  come from the authenticator app enrolled for the `chilu22` NPM account.
- Builds, typechecks, and `npm pack --dry-run` for both packages are clean; the CLI's
  `workspace:*` dependency correctly resolves to `@heysalad/sally-sdk@0.1.1` on pack.

## How to unblock (pick one)

1. **Authenticator OTP** — open the authenticator app for `chilu22`, then run:
   ```bash
   cd packages/sdk && pnpm publish --access public --no-git-checks --otp <CODE>
   cd ../cli   && pnpm publish --access public --no-git-checks --otp <CODE>
   ```
   (Each publish may need a fresh code; codes expire in ~30 s.)
2. **Granular access token** — create a token with publish rights for the
   `@heysalad` scope at npmjs.com → Access Tokens, then:
   ```bash
   NPM_CONFIG_//registry.npmjs.org/:_authToken=<TOKEN> pnpm publish --access public --no-git-checks
   ```
3. **CI trusted publishing** — repo already has OIDC trusted-publishing CI
   (commit 9fba11a); pushing a release tag through that pipeline avoids local 2FA.

## Scope caveat for this release

0.1.1 is a **CLI/SDK-only release** (kiosk/device/chat client). It does **not** include
the secure computer-agent provisioning layer (pairing codes, device keypairs, signed
sessions, capability-scoped commands, audit logs) — that is being built separately.
Do **not** publish `@heysalad/sally-agent` yet: its typecheck fails and secure
provisioning is not implemented.
