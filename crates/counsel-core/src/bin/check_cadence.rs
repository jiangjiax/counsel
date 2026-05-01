//! Diagnostic — print parsed cadence + max_tokens caps for all personas.
//! Run from repo root: `cargo run -p counsel-core --bin check_cadence`

use counsel_core::wisdom::PersonaRegistry;
use std::path::Path;

fn main() {
    let reg = PersonaRegistry::load(Path::new("./skills")).expect("load");
    println!("{:<18} {:>10}  step4   step6   step8", "slug", "cadence");
    println!("{}", "-".repeat(60));
    for p in reg.all() {
        println!(
            "{:<18} {:>10?}  {:>5}   {:>5}   {:>5}",
            p.slug,
            p.cadence,
            p.cadence.max_tokens_step4(),
            p.cadence.max_tokens_step6(),
            p.cadence.max_tokens_step8()
        );
    }
}
