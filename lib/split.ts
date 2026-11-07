export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function splitCentsDeterministic(totalCents: number, participants: string[]): Record<string, number> {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("Total amount must be a positive integer in cents");
  }

  if (participants.length === 0) {
    throw new Error("At least one participant is required");
  }

  const base = Math.floor(totalCents / participants.length);
  let remainder = totalCents % participants.length;

  return participants.reduce<Record<string, number>>((acc, key) => {
    const bonus = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    acc[key] = base + bonus;
    return acc;
  }, {});
}
