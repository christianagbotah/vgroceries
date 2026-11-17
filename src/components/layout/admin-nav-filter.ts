/**
 * Sidebar discovery is intentionally presentation-only.
 * Always filter by the active staff role BEFORE matching search text.
 * Backend permissions remain authoritative for all protected routes.
 */
export function filterAdminNav<T extends { label: string; href: string; permission: string }>(
  groups: readonly { title: string; items: readonly T[] }[],
  canView: (permission: T["permission"]) => boolean,
  search: string,
): { title: string; items: T[] }[] {
  const normalize = (value: string) =>
    value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en");
  const terms = normalize(search).trim().split(/\s+/).filter(Boolean);

  return groups.flatMap((group) => {
    const allowed = group.items.filter((item) => canView(item.permission));
    const items = terms.length
      ? allowed.filter((item) => {
          const haystack = normalize(`${group.title} ${item.label} ${item.href}`);
          return terms.every((term) => haystack.includes(term));
        })
      : allowed;
    return items.length ? [{ title: group.title, items }] : [];
  });
}
