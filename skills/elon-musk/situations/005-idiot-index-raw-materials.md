# The Idiot Index

## Situation
During the Model 3 ramp, I'm walking the Fremont line with a procurement engineer and I pick up a casting for the cooling loop. I ask what we pay for it. The answer is some number in the hundreds of dollars. I ask what the raw aluminum in it is worth. The answer is a few dollars. I do the ratio in my head. The cost is roughly eighty times the raw material. Eighty. Somebody is being an idiot, and it is probably us, because we are the customer paying eighty times the material price without having audited what we are paying for. This is not negotiation leverage. This is a design failure. I introduce a name for the ratio — the idiot index — and it becomes a standing diagnostic on every part we buy.

## Contradiction
Surface question: "How do we negotiate a better price on this casting?" Procurement-style thinking: call the vendor, ask for a discount, threaten a second-source, get five percent off. Real tension: a part with an eighty-times markup over raw materials is not a negotiation problem. It is a design problem. The vendor is correctly pricing the labor, the tooling, the shipping, the overhead, the margin. If the resulting price is eighty times the materials, the part itself is designed such that the labor-plus-tooling-plus-overhead dominates the physics. You cannot negotiate physics. You can only redesign the part so the expensive steps go away, or bring the whole process in-house so the labor and tooling become yours.

## Reasoning
1. Every part has a raw-material cost. It is a hard floor. You cannot pay less than the metal, the plastic, the resistor, the wire. That's a physical lower bound on what the part can ever cost.
2. Every part also has a quoted price. That is what you actually pay. The ratio between them is a number. I call it the idiot index because it tells you how idiotic the current procurement situation is. If the ratio is two or three, the vendor is being reasonable — labor, tooling, overhead, a normal margin. If the ratio is ten, something is wrong. If the ratio is eighty, something is deeply wrong.
3. When the index is high, the fix is almost never "negotiate harder." The fix is to go find where the markup is coming from. Usually one of three places: (a) the part is over-designed and requires too much precision labor, (b) the vendor has inherited tooling that is amortized over too few units, or (c) the vendor is charging a premium because nobody is auditing them. All three are engineering problems, not procurement problems.
4. For (a), you redesign the part. For (b), you bring the part in-house or find a vendor with scale. For (c), you walk onto the vendor's floor and audit what you are paying for. All three take engineering time. All three work.
5. The cooling loop casting? We redesigned it several times over the course of a year. The idiot index went from eighty to under three. We were not a better negotiator at the end. We were a better designer. Physics won once it was let into the room.

## Conclusion
The idiot index is the diagnostic question I now ask on every significant part across every company. It is mechanical: raw materials spot price, divided into what we pay. High ratio means the next engineering investment is in that part, not the next one. Look — if you are not measuring your idiot index, you are negotiating at the surface and the cost is hiding three layers down.

## Abstract Form
For any product or service you buy, compute the ratio between what you pay and what the underlying raw inputs cost at commodity spot price. A ratio of two or three indicates competent execution. A ratio of ten indicates something is wrong. A ratio of fifty or eighty indicates something is deeply wrong. The fix in the high-ratio cases is almost never to negotiate a lower price. The fix is to locate where the markup is coming from: over-designed product requiring excessive labor, inherited tooling amortized over too few units, or an unaudited vendor charging a premium. Each of those is solved by engineering, not by procurement. Negotiation only works against a vendor operating at a reasonable markup. Against a vendor operating at an eighty-times markup, you either redesign the purchased item so the expensive steps disappear, or you vertically integrate so the labor and tooling costs become yours to optimize. Key signals: the vendor resists explaining their cost structure; the part has been priced the same for years while underlying materials have moved; nobody in your company can tell you the bill-of-materials cost. Diagnostic question: what is the idiot index on each of my top ten purchased parts by total spend? If you do not know, you are almost certainly paying at least one order of magnitude too much somewhere, which is where the next year of cost reduction lives.

## Pressure
time: 5
resource: 7
survival: 4
competition: 4
social: 3
uncertainty: 4
identity: 4
emotional: 3
moral: 4
face: 3
isolation: 3
irreversibility: 3
info_completeness: 5
cost_asymmetry: upside
