# Roundtable Product Research
## AI Multi-Persona Advisory Board for Entrepreneurs

**Created:** 2026-04-08  
**Status:** Early research + concept validation  
**Owner:** Michael

---

## The Core Insight

When multiple AI personas debate each other, something real happens:
- **Conflicts emerge** — Steve Jobs pushes simplicity, Mao Zedong pushes survival, Bruce Lee pushes directness. They genuinely don't agree.
- **Synergies appear** — unexpected connections between Eastern and Western frameworks
- **Chemistry forms** — the tension between personas mirrors real human complexity. We are not extreme. We are contradictory. We struggle between right and left, up and down, life and death.

The roundtable is valuable precisely *because* the advisors fight with each other. That friction surfaces what a single perspective would miss.

---

## Michael's Personal Validation (First-Person Experiments)

Already tested and confirmed — these personas work:

| Persona | Use Case Validated | Method |
|---------|-------------------|--------|
| **Steve Jobs** | Product design review — always called to redesign/refine before shipping | Deep training on his frameworks, design philosophy, user obsession |
| **毛泽东** | Strategic survival thinking — big picture, irreducible constraints, long game | Used for strategic decisions, prioritization under pressure |
| **Bruce Lee** | Emotional regulation — "be water", stable reaction, 截拳道 mental training | Fed AI his quotes + frameworks on emotional thought patterns |

**Key finding:** Each persona creates a *different cognitive mode* in Michael. Jobs = aesthetic clarity. Mao = strategic ruthlessness. Bruce Lee = emotional fluidity. This is the real product value — not information, but *cognitive mode switching*.

---

## Target Niche: Entrepreneurs (Primary)

**Why entrepreneurs first:**
1. Most complex decision environment — irreducible uncertainty is their daily reality
2. Michael is the target customer — dog-fooding built in from day one
3. Political leaders also need this, but that market is inaccessible as a starting niche

**The entrepreneur's specific pain:**
- They must make decisions across domains they're not expert in (hiring, finance, product, culture, parenting, health) simultaneously
- They carry the cognitive load alone — no committee, no peer review
- The decisions have asymmetric stakes — one wrong call can end the company or the family

**The 3 unmet needs (from friend interviews):**
1. **Blind spots** — even strong people aren't capable in every dimension
2. **Missing perspectives** — they don't have access to what diverse wise people would say
3. **Cognitive cost** — simulating 12 different expert mindsets simultaneously is exhausting and time-consuming. They literally cannot do it alone.

---

## UX Design Insight (From Friends' Feedback)

### Two-Layer Output Design

**Layer 1 — Summary surface (default view):**
- Simple, clean synthesis of the debate
- Actionable "to-dos" or decision recommendations
- What the 12 advisors agreed on + where they diverged
- Energy-saving: user gets the essence without reading everything

**Layer 2 — Deep dive (click in):**
- Click any individual expert to read their full reasoning + logic
- 1-on-1 private session mode: go deeper with that specific advisor
- Come back to the group debate with new questions

**Why this matters:**
The cognitive load problem isn't just about generating insights — it's about *consuming* them. A 35,000-word debate transcript is useless if nobody reads it. The two-layer design makes the product usable by busy entrepreneurs who need decisions, not essays.

---

## Competitive Landscape Summary

### What exists — and why it falls short

| Competitor | What they do | Fatal gap for this use case |
|------------|-------------|----------------------------|
| **Character.ai** | 10-character group chat, entertainment | Memory lasts 5-20 msgs; content-filtered; no decision structure; teen market |
| **BoardroomIQ** | AI board for entrepreneurs | Business only; no philosophical figures; no life decisions; no private sessions |
| **Opper AI Roundtable** | 200 LLMs debate a question | LLM diversity ≠ wisdom diversity; no personas; no user biography |
| **Pi / Replika** | Emotional companion | Single voice; zero debate capability; no expertise depth |
| **Claude Projects / Custom GPTs** | DIY persona hacking | One persona per session; no group debate mode; requires prompt engineering skill |
| **Perplexity** | Research synthesis | Answers "what is true" not "what should I do given who I am" |

### The white space

Nobody has built:
- Multiple deeply-modeled wisdom personas with distinct philosophical frameworks
- Who debate each other with structured mechanics (not just parallel monologues)
- While maintaining persistent knowledge of the user's life context across months
- With Eastern-Western synthesis as a cultural positioning
- With a two-layer UX (summary + deep dive) designed for busy decision-makers

**Chinese market: complete blank.** No purpose-built product exists. Chinese entrepreneurs who read 兵法 AND follow YC are the perfect underserved niche.

---

## Product Concept: Core Features

### MVP (minimum viable roundtable)

1. **Group Debate Mode** — user inputs dilemma → 12 advisors debate simultaneously → structured synthesis
2. **Two-Layer Output** — summary/to-do on surface; click to expand each expert's full reasoning
3. **1-on-1 Private Session** — select any advisor → private deep-dive → return to group with new context

### Differentiators vs. all competitors

1. **Persona depth** — not surface roleplay; each advisor has a real philosophical framework, reasoning patterns, historical decision-making track record
2. **Persistent user biography** — the system knows who you are across sessions. Your daughter. Your 4月30日 deadline. Your conflict transformation work.
3. **Structured debate mechanics** — advisors respond to each other's logic, not just speak in parallel
4. **Eastern-Western synthesis** — 道德经 + Paul Graham in one room. This cultural positioning is invisible to Western competitors.
5. **Cognitive outsourcing UX** — designed to be energy-saving, not to overwhelm

---

## Moat Analysis

The technology is not the moat — parallel API calls are trivial. The moat is:

- **Persona depth models** — the quality of how each advisor reasons is the product
- **User memory layer** — getting to know the user over months creates lock-in
- **Cultural synthesis** — Eastern + Western wisdom is a positioning that Western teams won't attempt and Chinese generic AI teams won't think to build

---

## Open Questions (Next Research Steps)

1. **Pricing model** — per-session? Subscription? Enterprise for VC-backed startups?
2. **Persona curation** — who chooses the 12? User-configurable or curated by the product?
3. **Memory architecture** — how does the system build persistent user biography without feeling invasive?
4. **Persona IP risk** — using historical figures is legally safe; using living public figures (Bezos, Musk) needs careful positioning
5. **Debate mechanics** — how many rounds? Does the synthesis agent see all outputs and arbitrate? How to avoid "group consensus" that papers over real conflict?

---

## Next Actions

- [ ] Design the two-layer output UX in detail (wireframe or mockup)
- [ ] Define what "persona depth" means technically — what training data, what prompt structure
- [ ] Map the 12 default advisors and their reasoning frameworks
- [ ] Build interactive prototype: user inputs dilemma → see two-layer output
- [ ] Interview 3 more entrepreneur friends with the refined concept (emphasize cognitive outsourcing + two-layer UX)
