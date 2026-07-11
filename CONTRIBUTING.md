# Contributing to hospitality-mcp

Thanks for your interest! Contributions of all kinds are welcome — but the
single most valuable thing you can add is **a new PMS adapter**. Every adapter
makes this project useful to more hoteliers.

> This is an unofficial, community project (not affiliated with Apaleo). By
> contributing you agree your work is licensed under the project's
> [MIT License](./LICENSE).

## 🔐 Security first — read this before anything else

- **Never commit credentials.** No client ids/secrets, no `.env` files, no
  tokens — not in code, tests, fixtures, issues, or screenshots.
- Credentials are read **only** from environment variables (`.env`, which is
  git-ignored). The only `.env*` file in the repo is `.env.example`, containing
  placeholders.
- If a secret ever leaks, **rotate it** (regenerate it in the provider's
  dashboard). See [SECURITY.md](./SECURITY.md).
- Use fake, obviously-dummy values in tests and fixtures.

## Getting set up

```bash
git clone https://github.com/Mik2503/hospitality-mcp.git
cd hospitality-mcp
npm install
cp .env.example .env        # add your Apaleo sandbox credentials
npm run verify:auth         # confirm auth works (prints no secrets)
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run the test suite (Node's test runner; needs Node ≥ 22) |
| `npm run build` | Compile to `dist/` |
| `npm run dev` | Run the server from source with reload |
| `npm run verify:auth` | One-shot Apaleo auth + read smoke test |

Before opening a PR, make sure `npm run typecheck`, `npm test`, and
`npm run build` all pass. CI runs the same on every push and PR.

## 🧩 Adding a new PMS adapter (the main event)

The project is designed so a new PMS = **one adapter**, with zero changes to the
MCP tools or server. The full walkthrough is in
**[docs/ADD_AN_ADAPTER.md](./docs/ADD_AN_ADAPTER.md)**. In short:

1. Implement [`PMSAdapter`](./src/core/adapter.ts) (reads); optionally
   `WritablePMSAdapter` (writes) if your PMS supports them.
2. Keep provider-specific types isolated: `src/<pms>/types.ts` (raw shapes),
   `src/<pms>/mappers.ts` (pure raw→normalized mappers), `src/<pms>/adapter.ts`
   (orchestration). Nothing provider-specific may leak out of the adapter.
3. Follow the conventions: normalized dates/money, map unknown statuses to
   `"unknown"` (never guess active), throw `NotFoundError` /
   `CapabilityNotSupportedError` where appropriate, and set a `methodology`
   string for derived KPIs.
4. Unit-test your mappers against fixtures shaped like real API responses (see
   [`src/apaleo/mappers.test.ts`](./src/apaleo/mappers.test.ts)).

The [`src/apaleo/`](./src/apaleo) adapter is your reference implementation.

Opening an issue first (using the **New PMS adapter** template) is a great way to
coordinate and get early feedback.

## Other contributions

Bug fixes, docs, and refining the documented assumptions in
[docs/TODO.md](./docs/TODO.md) (e.g. validating the experimental write path
against a live PMS) are all very welcome.

## Pull request checklist

- [ ] `npm run typecheck`, `npm test`, and `npm run build` pass locally.
- [ ] No secrets or real credentials in any commit, test, or fixture.
- [ ] New/changed behavior is covered by tests where practical.
- [ ] Docs updated if behavior or setup changed.
- [ ] Commits are focused and clearly messaged.

## Code style

- TypeScript, ESM, `strict` mode. Match the surrounding code's style.
- Prefer small, pure functions (especially mappers) and clear names over
  cleverness.
- Validate all tool inputs with `zod`.

Happy hacking! 🏨
