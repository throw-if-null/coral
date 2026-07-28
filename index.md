---
layout: home

hero:
  name: Coral Architecture
  text: Capability-first, and built to be checked
  tagline: One capability per slice. Sharing only through a named, injected horizontal. Every rule carries a stable ID and an enforcement class — so the architecture can be verified, not just admired.
  image:
    src: /logo.png
    alt: Coral Architecture
  actions:
    - theme: brand
      text: Start with the conventions
      link: /CONVENTIONS
    - theme: alt
      text: The app spine
      link: /ARCHITECTURE
    - theme: alt
      text: See a slice in Go
      link: /examples/go-api-slice

features:
  - icon: 🧭
    title: Placement stops being a decision
    details: A slice owns one trigger end to end — its parsing, validation, behavior, state access, output, and tests. "Where does this go?" collapses to "find or make the feature package."
    link: /ARCHITECTURE#_3-the-four-categories-of-code-model
  - icon: 🚧
    title: Sharing has a gate, not a habit
    details: Duplication is allowed; extraction must earn it. A shared thing is promoted only when it is cross-cutting AND carries an invariant that would be a bug if it drifted.
    link: /ARCHITECTURE#_9-duplication-policy-extraction-test-dup
  - icon: ✅
    title: Rules with IDs and teeth
    details: Every rule is cited as [DUP-2] and classed [auto], [review], or [guide] — so you know which run on a linter, which need judgment, and which are only rationale.
    link: /CONVENTIONS#enforcement-classes
  - icon: ⚠️
    title: Honest about where it fails
    details: This fits command- and request-shaped apps with loosely-coupled features. It is weak for dense domains where every feature reaches into one central concept — a tax engine, a solver. Use something else there.
    link: /ARCHITECTURE#_1-purpose-scope-breakage-boundary-scope
---
