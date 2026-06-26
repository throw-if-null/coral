---
layout: home

hero:
  name: Coral Architecture
  text: A fractal, capability-first architecture
  tagline: Agents write the code; humans review and orchestrate. The same pattern from a single slice to a whole system.
  actions:
    - theme: brand
      text: Start here — the Coral Model
      link: /CONVENTIONS
    - theme: alt
      text: The App (one Colony)
      link: /ARCHITECTURE
    - theme: alt
      text: The System (the Reef)
      link: /SYSTEM

features:
  - icon: 🪸
    title: Polyps & symbionts
    details: A slice is a polyp — self-contained, does one thing. Cross-cutting concerns are hosted symbionts (horizontals), defined once and injected, never re-built per slice.
  - icon: 🧬
    title: Fractal, by design
    details: The same rules hold at every scale — polyp (slice) → colony (app) → reef (system) → island (platform). Own your trigger; share only via a named symbiont or a published skeleton.
  - icon: 🌊
    title: Composed over a bus
    details: Colonies never fuse bodies — they interact only through signals in the water (the bus). Apps stay independent, contract-tested, and within an agent's context.
  - icon: 🤖
    title: Built for agents
    details: Deterministic placement, bounded blast radius, and self-verifiable contracts. Every placement question reduces to “polyp, symbiont, skeleton, or colony?”
---
