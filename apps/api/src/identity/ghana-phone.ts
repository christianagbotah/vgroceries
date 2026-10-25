export function normalizeGhanaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  let national: string | null = null;

  if (/^0[0-9]{9}$/.test(digits)) national = digits.slice(1);
  else if (/^233[0-9]{9}$/.test(digits)) national = digits.slice(3);
  else if (/^[0-9]{9}$/.test(digits)) national = digits;

  return national ? `+233${national}` : null;
}

export function normalizeLoginIdentifier(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return { kind: "email" as const, value: trimmed.toLowerCase() };
  const phone = normalizeGhanaPhone(trimmed);
  return phone ? { kind: "phone" as const, value: phone } : { kind: "invalid" as const, value: trimmed };
}
