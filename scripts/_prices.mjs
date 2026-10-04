// Anthropic list prices, dollars per million tokens. Cache reads are a tenth
// of input and cache writes are 1.25x, which is what makes caching a prompt
// sent once a loss rather than a saving.
//
// One table, imported by everything that quotes a number, because two tables
// drift and then two scripts disagree about what the same run cost.
export const PRICES = {
  "claude-opus-5": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-haiku-4-5": { in: 1, out: 5 }
};
export const CACHE_READ = 0.1;
export const CACHE_WRITE = 1.25;

// Falls back to the most expensive row rather than to zero. A cost estimate
// that reads $0.00 because the model id was unrecognised is the one failure
// mode a spend brake must not have.
export function priceFor(model) {
  const hit = Object.keys(PRICES).find((id) => String(model || "").startsWith(id));
  return hit ? PRICES[hit] : PRICES["claude-opus-5"];
}

export function price(model, input, output, cacheRead = 0, cacheWrite = 0) {
  const p = priceFor(model);
  return (input * p.in + output * p.out
        + cacheRead * p.in * CACHE_READ
        + cacheWrite * p.in * CACHE_WRITE) / 1e6;
}

export const usd = (n) => `$${n.toFixed(4)}`;
