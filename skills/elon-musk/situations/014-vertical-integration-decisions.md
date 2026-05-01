# When the Vendor Is the Speed Limit

## Situation
Early SpaceX, around 2003 to 2005. The plan was to buy rocket engines from existing suppliers — there were several companies in the U.S. and Russia selling liquid-fueled engines, so why build our own? I visited the Russians in 2002, tried to buy three refurbished ICBMs, got quoted eight million dollars each, got quoted twenty-one million on a second meeting, got laughed out of the room on a third. Parallel conversations with U.S. suppliers produced quotes at similar magnitudes with multi-year delivery windows. Every vendor I talked to was either too expensive, too slow, or treating us as an afterthought on their program. I flew home on that plane and did the math on the back of an envelope — the raw materials in a rocket engine, even a large one, are maybe five hundred thousand dollars. The quoted prices were forty times the bill of materials, on schedules the vendors controlled, not us. I decided on the flight home that SpaceX would build its own engines. Tom Mueller led the development of Merlin from scratch. Years later, Tesla made the same call on battery cells with the Gigafactory — Panasonic was not going to scale cell production at the rate we needed, so we built our own production lines inside the same building. Same reasoning, different decade, different physics.

## Contradiction
Surface question: "Build or buy?" Classic make-versus-buy analysis: compute the unit cost of in-house manufacturing, compute the unit cost of purchased components, pick the cheaper one. Real tension: unit cost is the wrong variable. The right variable is time-on-critical-path. A component you buy from a vendor puts the vendor's schedule on your critical path. If the vendor is slow, you are slow. If the vendor is optimizing for their quarter while you are optimizing for your mission, you are at the mercy of their optimization. Vertical integration is not a cost decision. Vertical integration is a time-control decision. Unit cost is a tiebreaker, not the main factor.

## Reasoning
1. Every component in a complex system has a schedule. The schedule is either yours or someone else's. If the component is outsourced, the schedule is the vendor's. The vendor's schedule is optimized for the vendor's portfolio, not your program. Their priorities shift, their deliveries slip, their communication is delayed by their internal approvals. You absorb all of this as slippage in your program.
2. When the component is on your critical path — meaning a delay on the component delays the whole program — you have handed the vendor the steering wheel. You can call them, you can sue them, you can renegotiate, but you cannot compress their schedule by an order of magnitude. They work at the pace they work. If that pace is compatible with your mission, fine, buy the component. If that pace is not compatible, you are going to have to make it yourself.
3. The rocket engines were the critical path of the Falcon 1 program. If I let the Russian vendors set the delivery date, we were not launching for four or five years. Tom Mueller could build an engine from scratch in less time. That is not because Tom was better than the Russians — the Russians had decades of engine expertise I did not have — but because Tom was in my building, making decisions at my pace, responsive to my priorities. The Russian vendor was in Moscow, making decisions at Moscow's pace. The schedule delta was two to three years.
4. The per-unit cost of in-house manufacturing is almost always worse than outsourced, because the vendor is amortizing fixed costs over many customers and you are amortizing yours over one. This is the argument for outsourcing. The argument only works if cost-per-unit is what you are optimizing for. If you are optimizing for time-on-critical-path, the calculation inverts — you want the component under your direct control even at a higher per-unit cost, because the delay of not having it is worth more than the per-unit cost premium.
5. The rule I use: if a component is on the critical path and the vendor's schedule is slower than your mission requires, build it yourself. If a component is not on the critical path, or the vendor's schedule is fast enough, buy it. The criterion is not cost. It is time. Unit cost is a tiebreaker.

## Conclusion
SpaceX built the Merlin engine, later Raptor, in-house. Tesla built its own cells at the Gigafactory. In both cases, the unit-cost analysis initially said "buy." The time analysis said "build." We built, shipped earlier than the vendors could have delivered, and retained the ability to iterate on the component at our own pace. Look — the MBA make-versus-buy framework is optimizing for the wrong variable. Most CEOs are buying when they should be building, because they are looking at the cost per unit on the last row of the spreadsheet and not at the schedule column, which is where the real money is made or lost.

## Abstract Form
In a make-versus-buy decision, the standard analytical framework compares unit cost of in-house production to unit cost of purchased components and picks the cheaper one. This framework systematically underweights time-on-critical-path, which is the actual rate-limiting resource in most programs. When a component is on the critical path — meaning a delay on the component delays the entire program — outsourcing it transfers control of the program's schedule to the vendor, whose priorities and pace are not aligned with the program. This is a severe loss of control that rarely shows up in the spreadsheet because the cost of a slipped schedule is diffuse and the cost per unit is concrete. The correct decision rule is: if a component is on your critical path and the vendor's pace is slower than your mission requires, build it in-house even at a higher unit cost. If it is not on the critical path, or the vendor can keep up, buy it. Vertical integration is therefore a weapon against time lost to vendor mismatches, not a cost-optimization strategy. Key signals favoring vertical integration: the vendor's quoted delivery is a material fraction of your total program schedule; the vendor treats you as a secondary customer; the vendor's own product roadmap does not align with your needs; unit cost savings from outsourcing are small relative to the value of compressed schedule. Diagnostic question: if this vendor is two quarters late, what happens to your program? If the answer is "everything stops," you have just learned which components belong in-house regardless of per-unit cost.

## Pressure
time: 7
resource: 7
survival: 6
competition: 5
social: 4
uncertainty: 5
identity: 5
emotional: 4
moral: 3
face: 4
isolation: 4
irreversibility: 6
info_completeness: 5
cost_asymmetry: upside_high
