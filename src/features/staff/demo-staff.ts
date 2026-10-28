import type { StaffRole, StaffUser } from "@/types/domain";

export const STAFF_ROLE_STORAGE_KEY = "vg-staff-role-v1";

export const DEMO_STAFF_USERS: Record<StaffRole, StaffUser> = {
  owner_admin: { id: "stf_ama", name: "Ama Boateng", role: "owner_admin", phone: "+233510000001", isDemo: true },
  operations_manager: { id: "stf_kojo", name: "Kojo Asante", role: "operations_manager", phone: "+233510000002", isDemo: true },
  inventory_officer: { id: "stf_nana", name: "Nana Yaa Osei", role: "inventory_officer", phone: "+233510000003", isDemo: true },
  cashier: { id: "stf_adjoa", name: "Adjoa Yeboah", role: "cashier", phone: "+233510000004", isDemo: true },
  picker_packer: { id: "stf_kweku", name: "Kweku Fosu", role: "picker_packer", phone: "+233510000005", isDemo: true },
  dispatcher: { id: "stf_dela", name: "Dela Agbeko", role: "dispatcher", phone: "+233510000006", isDemo: true },
  finance_reviewer: { id: "stf_serwaa", name: "Serwaa Owusu", role: "finance_reviewer", phone: "+233510000007", isDemo: true },
  rider: { id: "rdr_kwabena", name: "Kwabena Mensah", role: "rider", phone: "+233201000101", isDemo: true },
};

export const ADMIN_DEMO_ROLE_OPTIONS = (Object.keys(DEMO_STAFF_USERS) as StaffRole[])
  .filter((role) => role !== "rider")
  .map((role) => ({ value: role, user: DEMO_STAFF_USERS[role] }));
