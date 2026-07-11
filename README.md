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

<!-- TODO(phase 4/6): full clone → sandbox creds → Claude config → first prompt -->

```bash
git clone https://github.com/<your-org>/hospitality-mcp.git
cd hospitality-mcp
npm install
cp .env.example .env   # then add your Apaleo sandbox credentials
npm run build
```

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
