const TITLES = new Set(["Dr", "Captain", "Sister", "Mr", "Mrs", "Ms"]);

/** "Dr Samuel Achebe" -> "Samuel"; "Beatrice 'Bea' Fontaine" -> "Beatrice". */
export function firstName(full: string): string {
  const parts = full.split(" ").filter((p) => !TITLES.has(p) && !p.startsWith("'"));
  return parts[0] ?? full;
}
