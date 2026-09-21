// One version string. Bump it whenever the system prompt, the guardrails or
// the closing logic change, because a conversation collected under one
// version is not evidence about another: it came from a different instrument.
// public/index.html carries the same string in its landing footnote and a
// test asserts the two agree, so they cannot drift apart.
export const VERSION = "0.3.0";
