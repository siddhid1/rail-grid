export function toIsoDate(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

export function isPastDate(value: string | Date): boolean {
  const target = new Date(toIsoDate(value));
  const today = new Date(toIsoDate(new Date()));
  return target < today;
}

export function overlapSegments(aFrom: number, aTo: number, bFrom: number, bTo: number): boolean {
  return aFrom < bTo && bFrom < aTo;
}
