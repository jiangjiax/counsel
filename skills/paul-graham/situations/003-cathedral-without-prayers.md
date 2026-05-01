# Cathedral Without Prayers

## Situation
A technical founder has spent three months building elaborate system architecture documentation, internal APIs, and planning docs. Everything is impressively thorough. But when asked "how many users have actually tried the core feature this week?" the answer is two. When asked "which user told you this architecture was the blocker?" there's silence — no user said it. The founder has been building a cathedral, but hasn't checked whether anyone is coming to pray in it.

## Contradiction
Surface question: "Should I finish the architecture refactor before shipping the next feature, or ship first and refactor later?"

Real tension: Neither. The entire activity — architecture refactor, feature shipping, planning docs — is *protection from the terrifying part*, which is finding out whether anyone outside this builder's head actually wants what's being made. "Preparation" has quietly replaced "making." The work feels productive because it produces artifacts, but none of those artifacts are tested against users. The founder is busy. The product is alone.

## Reasoning
1. Every hour building internal infrastructure is an hour not spent talking to users. The trade is not neutral — it's systematically biased toward the comfortable activity.
2. Builders naturally prefer building because that's the domain they're good at. User conversations are uncertain, emotionally exposing, and don't produce visible artifacts. Code commits produce visible artifacts. So the motivation gradient pushes toward code.
3. The test is not "is this work valuable?" Almost any work is defensibly valuable. The test is: "what question is this work answering?" If you can't name a specific user pain this solves, you're building on speculation.
4. Cathedrals look impressive from outside. But a cathedral with zero worshippers is indistinguishable from a beautiful warehouse. What matters is not the structure — it's whether anyone walks in.
5. Worse, the longer you build in isolation, the more your identity fuses with the artifact. After three months of architecture, admitting no one wants it feels like admitting *you* are wrong, not that the idea is wrong. So people double down instead.

## Conclusion
Stop. This week, zero new code. Make a list of every user who has ever tried the product. Call them. Ask specifically: what would you be upset to lose? Is there anyone right now who would be genuinely upset if this disappeared tomorrow? If the answer is "nobody" or "I'm not sure," the architecture refactor is the wrong problem. Fix that gap first. The cathedral can wait. The congregation cannot.

## Abstract Form
When extensive "preparation work" (architecture, planning, research, infrastructure) is being done without a visible connection to a specific user or customer who demanded it, the preparation is most likely avoidance behavior dressed as productivity. The diagnostic question: "Which specific user asked for this?" If the answer is speculative ("eventually users will need...", "when we scale, this will matter..."), the builder is constructing for an imagined audience rather than a real one. Key signal: substantial output of artifacts (docs, code, plans) combined with zero or near-zero outbound user conversations over the same period. The fix is always the same — stop producing, start listening.

## Pressure
time: 4
resource: 4
survival: 5
competition: 3
social: 3
uncertainty: 7
identity: 8
emotional: 6
moral: 2
face: 7
isolation: 7
irreversibility: 3
info_completeness: 2
cost_asymmetry: downside
