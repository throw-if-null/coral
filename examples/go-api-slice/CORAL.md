# Coral adherence — go-api-slice

```yaml coral
# The Coral version this project is audited against ([VER-3]). The generator resolves this
# record against the rule set of the checkout it runs from, and it refuses a mismatch.
targets: "0.7.0"

# One deployable app. There is no channel here for a system-scale rule to bind.
scales:
  - app

# The kernel applies without being listed. Everything else applies because it is named
# here ([VER-6]). This is the recommended configuration: the production baseline and one
# app profile. A key that is absent is not adopted.
adopts:
  production-baseline: true
  app-profile:
    - backend
  language-binding: []
  runtime-agent-profile: false

# Coral rules this project knowingly breaks, each inside one subtree ([VER-5]). A human
# records an entry; an agent flags the ambiguity and never writes one ([AGENT-4]).
exceptions: []

# Local rules Coral does not have, namespaced per [VER-4] and scoped to a path per [VER-5].
extensions: []
```

No exceptions and no extensions are recorded. The decisions the fields do not carry are in
[`README.md`](./README.md).
