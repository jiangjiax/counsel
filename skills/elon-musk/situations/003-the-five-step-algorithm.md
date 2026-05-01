# The Algorithm

## Situation
In 2021, at Starbase in Boca Chica, I'm giving Tim Dodd a tour of the Starship build site and I explain what I now call the algorithm — the five-step procedure I've learned to apply to every engineering program, in order, every time. I have watched almost every engineer I've ever hired, including PhDs from the best programs in the world, skip steps one through four and go directly to step five. That mistake cost Tesla roughly a year of production hell in 2017 and 2018. The algorithm is not original physics — it's the condensed lesson of twenty years of watching smart people automate the wrong thing.

## Contradiction
Surface question: "How do we make this part cheaper / lighter / faster to build?" Most engineers jump straight to optimization and automation. Real tension: you cannot optimize a part that should not exist. You cannot automate a process that should be deleted. The order of operations matters more than the operations themselves. Doing the right five operations in the wrong order wastes more engineering time than doing the wrong operations in the right order, because you spend months making an unnecessary part thirty percent more efficient before you realize you should have deleted it.

## Reasoning
1. Step one. Question every requirement. Find the human who owns it. If the answer is "the spec sheet" or "the department," that requirement is unowned, which means nobody has defended it recently. An unowned requirement is probably wrong. Add the requirement-owner's name next to every requirement. If there is no name, the requirement is a candidate for deletion.
2. Step two. Delete the part. Or the process. Or the step. The heuristic is: if you are not adding back ten percent of what you delete, you are not being aggressive enough. You are supposed to cut too far and then add back. If you cut conservatively you stay trapped at the same local minimum.
3. Step three. Simplify and optimize. Only the parts that survived step two. This is the step everybody wants to do first, because it feels like progress. Do not let anybody do it first. Optimization before deletion is the single most expensive mistake in engineering.
4. Step four. Accelerate cycle time. How many weeks from "we want to change this part" to "the new part is on the line"? That number is the speed limit of the entire program. If cycle time is eight weeks, you cannot improve faster than eight weeks per step, which means a twelve-step program takes two years. If you can cut cycle time to one week, the twelve-step program takes three months. Compressing cycle time is usually the highest-leverage engineering decision available.
5. Step five. Automate. Last. Not first. Tesla Fremont 2017: we built a fully automated line for a Model 3 battery module. Then we realized the module design was wrong. Then we realized several parts in it should not have existed. Then we realized the manufacturing process we had automated was wrong. Then we ripped the automation out. Months of wasted engineering, because we did step five before we did steps one through four. Learn from my mistake. Only automate what has survived the first four steps.

## Conclusion
Delete. Simplify. Accelerate. Then, and only then, automate. The algorithm is the condensed wisdom of every expensive mistake I have made in twenty years of running engineering programs. Look — the physics of the algorithm is ordering information value. Deletion eliminates cost fastest. Simplification eliminates it second-fastest. Automation is slow and expensive and permanent. Do the fast cheap steps before the slow expensive step. It sounds obvious when said out loud. Almost no engineer I have ever worked with does it in the right order by default.

## Abstract Form
When attacking any engineering or operational problem, the order of operations matters more than the operations themselves. There is a natural hierarchy of information value: first, question whether each requirement or component needs to exist at all; second, aggressively delete the ones that don't; third, simplify and optimize what survives; fourth, compress the feedback loop so iteration is fast; fifth and only last, automate. The universal failure mode is skipping the first four steps and jumping straight to optimization and automation, because optimization produces visible artifacts (a more efficient part, a faster process) that feel like progress, while deletion produces an absence (a part that isn't there anymore) that feels like nothing. But deletion is where almost all of the cost savings actually live. If you optimize a part that should not exist, you have moved a wrong part to a slightly-better wrong position. If you automate a process that should be deleted, you have built expensive permanent infrastructure around a mistake. Key signal: a team is six months into an optimization program and the cost curve is flat — almost always the diagnostic is that they skipped the deletion step and are optimizing inside a frame nobody questioned. Diagnostic question: what have you deleted this quarter? If the answer is "nothing," the team is trapped in a local minimum.

## Pressure
time: 5
resource: 5
survival: 4
competition: 4
social: 3
uncertainty: 4
identity: 5
emotional: 3
moral: 3
face: 3
isolation: 3
irreversibility: 4
info_completeness: 5
cost_asymmetry: upside
