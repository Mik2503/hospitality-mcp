---
description: Scaffold a new PMS adapter following this project's architecture
argument-hint: <pms-name>
---

Scaffold a new PMS adapter for **$1** in this repo, using the existing Apaleo
adapter as the template and `docs/ADD_AN_ADAPTER.md` as the guide.

First read, to match the exact patterns:
- `docs/ADD_AN_ADAPTER.md`
- `src/core/adapter.ts` — the `PMSAdapter` (reads, mandatory) and
  `WritablePMSAdapter` (writes, optional) contract
- `src/core/domain.ts` and `src/core/queries.ts` — the normalized types every
  method takes and returns
- the Apaleo adapter under `src/apaleo/` — the reference implementation

Then create `src/$1/` mirroring Apaleo:
- `adapter.ts` — `class <Pms>Adapter implements PMSAdapter`. Only also implement
  `WritablePMSAdapter` if the PMS supports mutations, and keep writes opt-in.
- `client.ts` — a thin HTTP client for the provider API.
- `auth.ts` — token/credential handling. NEVER log secrets; use
  `src/util/redact.ts`.
- `mappers.ts` — map provider shapes to the normalized domain types. No
  provider-specific detail may leak past this file. Unknown enum values map to
  `unknown`, never an active state.
- `factory.ts` — a `create<Pms>Runtime(config, logger)` wiring auth + client +
  adapter, mirroring `src/apaleo/factory.ts`.
- `mappers.test.ts` and an adapter/auth test using the in-memory/mock style of
  `src/apaleo/*.test.ts` (no network in tests).

Rules:
- Throw `CapabilityNotSupportedError` (from `../core/index.js`) for any read the
  PMS genuinely can't do — never invent data.
- Add config plumbing in `src/config.ts` and register the adapter where the
  provider is selected.
- Do NOT hardcode credentials in code, tests, or fixtures.
- Match the surrounding code's style and comment density.
- Run `npm run typecheck` and `npm test`; make them pass. Record any uncertain
  provider assumptions in `docs/TODO.md`.
- `main` is protected — put this on a branch and open a PR.
