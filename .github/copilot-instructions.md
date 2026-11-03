# Git commit message conventions

When generating Git commit messages for this repository (including GitHub Desktop's **Generate commit message with Copilot** action), use this format:

**Summary field**
- Write one Conventional Commit header: `type(scope): short imperative description`.
- Choose the most accurate type: `feat`, `fix`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`, or `chore`.
- Use a meaningful scope when relevant (for example, `core`, `timeline`, `elements`, `ui`); omit it otherwise.
- Use lowercase, an imperative verb (for example, `add`, `fix`, `update`), and no trailing period.
- Aim for at most 72 characters. No emoji, markdown heading, or bullet in the summary.

**Description field**
- Always provide a non-empty description made of hyphen-prefixed bullets: `- `.
- Use 2–5 concise bullets for substantive changes; one bullet is fine for a genuinely tiny change.
- Explain the actual changes, key behavior, and relevant reason or consequence. Do not just repeat the summary.
- Base every claim on the selected diff. Do not invent features, tests, verification results, or motivations.
- Write one idea per bullet; avoid filler, headings, and numbered lists.
- Put all bullets in the GitHub Desktop **Description** field, not the **Summary** field.

**Example**

Summary:
`test(core): add unit tests for timeline and editable elements`

Description:
- Verify tick-to-second conversions and BPM validation.
- Cover shared element movement, resizing, and timing constraints.
- Confirm audio duration remains fixed during tempo synchronization.

These formatting rules apply to commit-message generation only; do not force commit-message formatting on ordinary code or chat responses.
