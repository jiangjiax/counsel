# Delete the Part

## Situation
Tesla Fremont, 2018. I am walking the Model 3 assembly line with Sandy Munro's tear-down report in hand and a set of notes from my own factory walk the day before. I pick up a small bracket. It is holding a piece of interior trim against another piece of interior trim. I ask the engineer what it does. He explains. I ask what would happen if we removed it. He thinks. He says the trim might rattle a little. I remove it from the design. The next day, a piece of glass that has been separately installed with its own harness and bracket system. I ask what happens if we redesign the adjacent part to include the glass as a pressed-in feature. Turns out, that works. I remove the separate glass assembly. Over two weeks I walk the factory line and delete, delete, delete. Some of the deletions have to be reversed when we discover they broke something downstream. Most of them stick. The car ships lighter, cheaper, and simpler than it was going to be, and a half-dozen line stations disappear from the assembly flow.

## Contradiction
Surface question: "Can we optimize this part to cost less?" Engineering-team instinct: take the existing part and make it cheaper. Real tension: every part you optimize that should not exist is an optimization wasted. The bias toward addition is systemic — engineers get credit for adding brilliant features, not for removing unnecessary ones; removal reduces the apparent scope of someone's work; adding is the default motion, removing requires explicit courage. So parts accumulate over years and nobody prunes, until the product is twenty percent more complex than it needs to be, thirty percent more expensive than it needs to be, and contains dozens of parts whose purpose nobody can articulate.

## Reasoning
1. The default motion of engineering is addition. Somebody proposes a new feature, a new sensor, a new bracket, a new harness. It gets added to the design. Most of the time it does not get reviewed for whether it is really necessary, because the person who proposed it is in the meeting and the person who would remove it is not.
2. Which means, over years, parts accumulate. Each individual part had a defensible reason at the time. The aggregate is a product that has thirty percent more parts than the physics requires.
3. The discipline to counteract this bias is brutally simple: for every part, ask "what happens if we delete it?" Then try deleting it. Do not ask the engineer who designed it to evaluate deletion. They have sunk cost in the part. They will find reasons to keep it.
4. The heuristic I use is: if you are not adding back ten percent of what you delete, you are not being aggressive enough. You are supposed to cut too far, then add back the things that turn out to be load-bearing. If you cut conservatively, you stay at the same local minimum.
5. When the deletion works, which is most of the time, you have saved the cost of the part, plus the cost of its manufacturing, plus the cost of its failure modes, plus the cost of its inventory, plus the cost of its training documentation, plus the cost of the station on the line that was installing it. A single part deletion can reduce total system cost by ten times what the part itself cost. That compounds over hundreds of parts. It is why deleted-part engineering is the single highest-ROI engineering activity available.

## Conclusion
Over about a year, we deleted hundreds of parts from Model 3, simplified the assembly flow, and reduced the effective cost per vehicle by thousands of dollars. Most of the deletions were individually small. The aggregate was enormous. Look — if you are not deleting more than you are adding, your product is getting more complex every year, which means more expensive, which means harder to ship. The bias toward subtraction is a discipline. It does not happen by default. Somebody in the room has to be the designated deleter, every week, for the life of the product.

## Abstract Form
The default motion in any complex system — a product, a codebase, an organization — is addition, because adding produces visible artifacts and removing produces absences. The aggregate over years is that the system accumulates more components than the underlying purpose requires: code paths whose use case nobody remembers, product features used by no one, organizational processes defending against failure modes that no longer exist. The discipline to counteract this is to make deletion an explicit recurring activity, driven by someone whose job is to ask "what happens if we remove this?" for every component, and to run the deletion experiment rather than relying on the component's owner to defend it. The right heuristic is aggressive: if you are not restoring ten percent of what you delete, you are not cutting deep enough. Cut past the useful point, then restore the parts that turn out to be load-bearing. The net effect is systems that stay near their physical minimum of complexity rather than drifting toward maximum complexity over time. Key signals that a system has drifted: nobody can explain why a given component exists; the component's owner has moved on and nobody has taken over defending it; the component has not been touched in a year. Diagnostic question: what have you deleted from this system in the last quarter? If the answer is nothing, the system is accreting complexity by default and will eventually become unmaintainable.

## Pressure
time: 6
resource: 5
survival: 5
competition: 4
social: 4
uncertainty: 4
identity: 5
emotional: 4
moral: 3
face: 3
isolation: 4
irreversibility: 4
info_completeness: 6
cost_asymmetry: upside
