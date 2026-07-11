# Security Policy

`hospitality-mcp` is designed to be trustworthy by default. It runs entirely on
your own machine, talks only to your PMS provider, and ships no telemetry. This
document explains the security posture and how to report issues.

> **Unofficial project disclaimer.** This is an unofficial, community-built
> project. It is **not affiliated with, endorsed by, or supported by Apaleo**.
> "Apaleo" and related marks belong to their respective owners.

## Security posture

- **Local-only.** The server runs on your machine over stdio. There is no
  intermediate server and no telemetry. Your credentials and hotel data never
  leave your machine except to reach the PMS API directly.
- **Read-only by default.** Write tools (`create` / `modify` / `cancel`
  reservation) are **disabled** unless you explicitly set
  `APALEO_ENABLE_WRITES=true`. When disabled they are not registered at all.
- **Explicit confirmation for writes.** Every write tool requires an explicit
  `confirm: true` parameter and returns a human-readable **preview** first.
  Without `confirm`, nothing is executed.
- **Least privilege.** Only read scopes are requested by default. Write scopes
  are requested only when write mode is enabled.
- **No secret logging.** Access tokens and credentials are never written to
  logs or error messages. Any token that must be referenced is redacted
  (`****`).
- **Safe token handling.** Access tokens are cached in memory, refreshed on
  expiry/401, and never persisted to disk.

## Handling credentials

Credentials are read **exclusively** from environment variables (via a local
`.env` file that is git-ignored). No secret is ever hardcoded in source code,
tests, or fixtures.

### If a secret is ever leaked — rotate it

Git history is permanent. Treat **every** commit as if it were already public.
A secret committed once stays visible in history even if a later commit removes
it. Deleting it in a follow-up commit is **not** sufficient.

**If an Apaleo `client_id` / `client_secret` (or any credential) is ever
committed, pushed, pasted, or otherwise exposed:**

1. **Rotate it immediately** — regenerate the credential in the Apaleo
   dashboard so the exposed value becomes useless.
2. Update your local `.env` with the new value.
3. Only then worry about scrubbing history (e.g. `git filter-repo`).
   Scrubbing alone does **not** make a leaked secret safe — rotation does.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public issue.
Instead, report it privately via GitHub's
[Security Advisories](https://docs.github.com/en/code-security/security-advisories)
("Report a vulnerability") on this repository. We will acknowledge and address
valid reports as quickly as we reasonably can.
