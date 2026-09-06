import crypto from "crypto";

/**
 * Performs a cryptographically unbiased Fisher-Yates (Knuth) shuffle.
 * Uses Node.js crypto.randomInt to avoid pseudo-random predictable biases.
 */
export function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
