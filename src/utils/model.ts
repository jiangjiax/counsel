export function getModel(): string {
  return process.env.CODEANY_MODEL ?? "claude-sonnet-4-6";
}
