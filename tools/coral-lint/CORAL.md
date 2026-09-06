# Coral adherence

`coral-lint` is a Coral CLI, and this is its adherence record: the Coral it targets, the
scales it is written at, and the non-kernel scopes it adopts. If the tool could not state
what it owes, it would have no business telling other projects what they owe.

```yaml coral
targets: "0.7.0"

scales:
  - app

adopts:
  production-baseline: true
  app-profile:
    - cli
  language-binding: []
  runtime-agent-profile: false
```

**One app, so `app` alone.** There is one deployable unit here and no channel between apps,
so nothing at system scale has anything to bind.

**No exceptions and no extensions.** The tool passes its own gates — see the note at the top
of `coral.toml` — and it has no local rule Coral does not already state. Both registers are
empty because there is nothing in them, not because nobody looked; an entry appears here when
a human decides one is needed (`[AGENT-4]`).

**Not `runtime-agent-profile`.** The tool runs no model. **Not `library`**, either: it is
consumed as a command, and its published contract is the exit code, the channel split and the
`--json` payload — not an importable API.

The Coral repository's own build resolves this record with the same resolver a consuming
project would use, so it cannot drift from the registries it names.
