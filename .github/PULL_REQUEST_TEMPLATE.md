<!-- Thanks for contributing! Please fill this in and delete the hints. -->

## What & why

<!-- What does this PR change, and why? Link any related issue: Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature / tool
- [ ] New PMS adapter
- [ ] Docs
- [ ] Other:

## Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] **No secrets/credentials** in any commit, test, or fixture
- [ ] Tests added/updated where practical
- [ ] Docs updated if setup or behavior changed

## For a new PMS adapter

<!-- Delete this section if not applicable. -->

- [ ] Provider-specific types stay isolated in `src/<pms>/` (nothing leaks out)
- [ ] Mappers are pure and unit-tested against realistic fixtures
- [ ] Unknown statuses map to `"unknown"`; unsupported capabilities throw
      `CapabilityNotSupportedError`
- [ ] Derived KPIs set a clear `methodology` string
- [ ] Followed [docs/ADD_AN_ADAPTER.md](./docs/ADD_AN_ADAPTER.md)

## Notes for reviewers

<!-- Anything specific you'd like feedback on. -->
