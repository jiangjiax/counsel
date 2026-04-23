// Test debate_facilitator_prompt and all_positions collection

fn debate_facilitator_prompt(dim: &str, all_positions: &str) -> String {
    format!(
        r#"Below are the advisors' statements on the "{}" dimension:

{}

---
Extract the core conflict for this dimension:
**Core Contradiction**: (one sentence)
**Pro Argument**: (one sentence)
**Con Argument**: (one sentence)"#,
        dim, all_positions
    )
}

fn main() {
    // Simulate all_positions being empty
    let dim_name = "Dimension 1: Primary Justification for a Pivot";
    let all_positions_empty = "";
    let all_positions_with_content = r#"## Warren Buffett
Pivot only if the metrics unambiguously demand it. Cash runway and unit economics are the ultimate arbiter.

## Steve Jobs
Great products come from gut intuition, not metrics. Follow your instinct on the vision.

## Elon Musk
Move fast and pivot aggressively if the data shows the current approach won't scale.
"#;

    println!("=== Empty positions ===");
    let prompt_empty = debate_facilitator_prompt(dim_name, all_positions_empty);
    println!("{}", prompt_empty);
    println!("\nPrompt length: {} chars\n", prompt_empty.len());

    println!("=== With content ===");
    let prompt_content = debate_facilitator_prompt(dim_name, all_positions_with_content);
    println!("{}", prompt_content);
    println!("\nPrompt length: {} chars", prompt_content.len());
}