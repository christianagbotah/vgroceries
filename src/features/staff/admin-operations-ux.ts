export interface SupplierFilterRow {
  id: string;
  name: string;
  phone: string;
  email?: string;
  notes: string;
  isActive: boolean;
  poCount: number;
  openPoCount: number;
}

export interface PurchaseFilterRow {
  id: string;
  reference: string;
  supplierId?: string;
  supplierName?: string;
  status: string;
  createdAtLabel: string;
  lines: unknown[];
}

export function filterSuppliers<T extends SupplierFilterRow>(rows: T[], query: string, status: string): T[] {
  const term = query.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesText = !term || `${row.name} ${row.phone} ${row.email ?? ""} ${row.notes}`.toLowerCase().includes(term);
    const matchesStatus = status === "all" || (status === "active" ? row.isActive : status === "inactive" ? !row.isActive : true);
    return matchesText && matchesStatus;
  });
}

export function filterPurchases<T extends PurchaseFilterRow>(rows: T[], filters: { query: string; status: string; supplierId: string }): T[] {
  const term = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesText = !term || `${row.reference} ${row.supplierName ?? ""}`.toLowerCase().includes(term);
    const matchesStatus = filters.status === "all" || row.status === filters.status;
    const matchesSupplier = filters.supplierId === "all" || row.supplierId === filters.supplierId;
    return matchesText && matchesStatus && matchesSupplier;
  });
}
