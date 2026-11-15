-- POS read-access foundation (no till or sale mutation grants).
-- PostgreSQL enum expansion is isolated so a subsequent migration can use it
-- after it has committed. Existing admin-only database mutation triggers remain.
ALTER TYPE "Role" ADD VALUE 'cashier';
