# The Requirement From an Intern

## Situation
Tesla battery engineering, around 2018. We are trying to reduce the cost of the Model 3 battery pack and one particular requirement keeps driving up cost — a flame-retardant barrier between the pack and the vehicle floor, to a specification that adds mass, cost, and manufacturing complexity. I ask the engineer who inherited the spec: why this thickness, why this material, why this test? He does not know. He is doing what the document says. I ask who wrote it. He does not know. We chase the document through three generations of ownership. The original author turns out to have been a summer intern in 2011 who added the requirement because he read about a battery fire in an article and wanted to be safe. No calculation. No physics. No regulation requiring it. A 2011 intern's caution, still shaping 2018 manufacturing cost on a mass-production car. The requirement survives because nobody has the authority — or the courage — to delete a safety-labeled requirement without a rigorous defense.

## Contradiction
Surface question: "How do we make this flame-retardant barrier cheaper?" Engineering instinct: optimize the material, lighter backing, cheaper adhesive. Real tension: the requirement itself is not defensible from physics or regulation. An undefended requirement is not a requirement — it is an inherited opinion that accumulated the weight of fact because no one audited it. The cost of the barrier is not the problem. The problem is that the entire company has been manufacturing to an unowned specification for seven years, paying the cost per unit across hundreds of thousands of cars, because the requirement-audit never happens. Multiply one intern's ambient caution by seven years by three hundred thousand cars and you are looking at nine figures of cost driven by something nobody would defend if asked.

## Reasoning
1. Every requirement must have a human owner. Not a department. Not a document number. A specific person with a phone number who can tell you, today, why the requirement exists and what physics or regulation or customer need it is defending. If the owner cannot answer those three questions in the meeting, the requirement is orphaned.
2. Orphaned requirements are the dark matter of engineering cost. They do not show up on any spreadsheet as a line item. They are embedded in the part specs, the manufacturing processes, the test protocols, the QA procedures. Each one individually costs a small amount. In aggregate, they are usually thirty to fifty percent of the cost of a mature product, because they have accumulated over years without anyone removing them.
3. The reason they do not get removed is that every requirement was labeled "safety" or "quality" or "compliance" at some point in its history, and removing a safety-labeled requirement requires more political capital than most engineers possess. So they inherit the requirement, honor it, and quietly pay the cost. Which means the company pays the cost in perpetuity.
4. The discipline is simple but unpopular. Every major program, you go line by line through the requirement document, and for each requirement you ask: who owns this, what does the physics say, is it driven by an actual regulation, and can we show the calculation that produced the number? Anything that fails the audit gets flagged. Anything that fails the audit three times in a row gets deleted.
5. In the Model 3 case, we found the intern's requirement, ran the physics, found that a much lighter material met the actual need, consulted the actual regulations (which were less restrictive than the internal spec), and dropped the cost of that barrier by roughly a factor of four. Multiply by a few hundred thousand cars per year and the number is consequential. We found dozens of these across the Model 3 program. Every one of them was a small inherited opinion that had become manufacturing cost.

## Conclusion
We instituted a rule across Tesla engineering: every requirement has an owner's name next to it, and if the owner leaves, the requirement is re-reviewed. If we cannot find an owner, the requirement is deleted. This has saved more cost over the last five years than almost any other single engineering practice. Look — unowned requirements are the largest invisible cost center in most mature engineering organizations. Find them and delete them. The company will get cheaper, the product will get simpler, and nobody will miss the intern's 2011 caution.

## Abstract Form
Every requirement in a mature engineering document has a specific human author and a specific original justification, but over time the author moves on, the justification gets forgotten, and the requirement becomes ambient — honored by everyone, owned by no one. Unowned requirements survive indefinitely because removing them carries political risk (especially if they are labeled safety or quality) while keeping them carries only financial risk, which is distributed across the organization and invisible to any individual. The aggregate cost of unowned requirements in a mature product is usually between thirty and fifty percent of total cost, though it is almost never visible as a line item. The discipline to recover this cost is mechanical: for every requirement, identify the current owner, validate the physics or regulation that drives it, and delete the ones that fail the audit. Key signals that an organization has accumulated unowned requirements: specs have not been re-reviewed in multiple product generations; engineers cannot explain why specific numeric values were chosen; phrases like "we've always done it this way" accompany cost defenses; the specification document has more named contributors in the change log than are currently employed. Diagnostic question: for each major requirement, can you name the person currently accountable for it, and can they defend the specific numeric values with physics or regulation? If you cannot answer both for a majority of requirements, your cost structure is being driven by accumulated opinions from people who have left the building.

## Pressure
time: 5
resource: 6
survival: 4
competition: 4
social: 5
uncertainty: 4
identity: 5
emotional: 3
moral: 4
face: 4
isolation: 3
irreversibility: 3
info_completeness: 5
cost_asymmetry: upside
