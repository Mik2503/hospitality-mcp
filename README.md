<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# 🏨 hospitality-mcp

**Talk to your hotel's PMS in plain language.**
An unofficial [Model Context Protocol](https://modelcontextprotocol.io) server
that connects hotel property-management systems to AI assistants like Claude —
starting with [Apaleo](https://apaleo.com).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Made with TypeScript](https://img.shields.io/badge/TypeScript-Node.js-3178c6.svg)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-server-000.svg)](https://modelcontextprotocol.io)

</div>

> ⚠️ **Unofficial project.** This is an unofficial, community-built project. It
> is **not affiliated with, endorsed by, or supported by Apaleo**. "Apaleo" and
> related marks belong to their respective owners.

---

## What is this?

`hospitality-mcp` lets front-desk, revenue, and management users **ask and act
on their hotel data in natural language** from inside Claude — without logging
into the PMS panel. "Who arrives today?", "What's our occupancy this month?",
"Find the Müller reservation" — answered from live PMS data.

## 🚀 The hook: try it in 5 minutes, no hotel required

Apaleo offers a **free, self-serve sandbox with sample data**. You can clone
this repo, plug in free sandbox credentials, and see it working against a
realistic hotel dataset **without owning a hotel**. That's the whole point.

<!-- TODO(phase 6): add asciinema / GIF demo here -->

## Use cases

<!-- TODO(phase 6): expand with real prompt examples per persona -->

- **Front desk / ops** — arrivals & departures today, VIP arrivals,
  housekeeping status, calendar gaps.
- **Revenue / management** — occupancy, ADR, RevPAR, month-over-month, booking
  pace.
- **Guest** — look up a reservation, view a guest profile and history.
- **Actions (opt-in, with confirmation)** — create, modify, or cancel a
  reservation conversationally.

## Quick start

<!-- TODO(phase 4/6): add Claude config + first prompt to complete the quick start -->

```bash
git clone https://github.com/<your-org>/hospitality-mcp.git
cd hospitality-mcp
npm install
cp .env.example .env   # then add your Apaleo credentials (see below)
npm run build
```

### 1. Get free Apaleo credentials

Apaleo offers a **free, self-serve developer account** — no sales call, no
contract — with a test environment you can use to try this project.

1. **Sign up** for a free apaleo account at
   [apaleo.dev](https://apaleo.dev) → _Sign up_ (this also gives you access to
   the developer dashboard).
2. Open the dashboard at
   [app.apaleo.com/dashboard](https://app.apaleo.com/dashboard).
3. Go to **Apps → Connected apps → Add a new app → Add custom app**.
4. Fill in a **Client code** and **Client name** (anything you like).
5. Under **Scopes**, grant the read scopes this server uses:
   - `setup.read`
   - `reservations.read`
   - `availability.read`
   - `folios.read`
   - `maintenances.read`

   Only add `reservations.manage` if you plan to enable writes (off by
   default).
6. Save, then copy the generated **Client ID** and **Client Secret**.
   > 🔒 Store the client secret securely and never commit it. If it ever leaks,
   > rotate it in the dashboard (see [SECURITY.md](./SECURITY.md)).

### 2. Add your credentials

Paste them into your local `.env` (created from `.env.example`):

```dotenv
APALEO_CLIENT_ID=your_client_id_here
APALEO_CLIENT_SECRET=your_client_secret_here
```

### 3. Verify authentication

Confirm everything works with a one-shot check that gets a token and makes a
single trivial read call — it prints **no** secrets or tokens:

```bash
npm run verify:auth
```

Expected output ends with `🎉 Apaleo authentication is working.`

_Claude Desktop / Claude Code configuration snippet coming in a later build
phase._

## Security

<!-- TODO(phase 6): expand -->

- **Local-only**, no intermediate server, no telemetry.
- **Read-only by default.** Writes require an explicit opt-in flag.
- **Writes need confirmation** and show a preview first.
- **Least-privilege OAuth** scopes.

See [SECURITY.md](./SECURITY.md) for the full policy.

## Architecture

Built around a PMS-neutral core so the community can add more PMS platforms as
adapters. See [`docs/ADD_AN_ADAPTER.md`](./docs/ADD_AN_ADAPTER.md) _(coming in a
later phase)_.

## License

[MIT](./LICENSE) © hospitality-mcp contributors
