/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const shell = readFileSync("src/components/layout/admin-shell.tsx", "utf8");
const pagePath = "src/app/admin/logistics/page.tsx";
const workspacePath = "src/features/logistics/logistics-workspace.tsx";
const nodesPath = "src/features/logistics/nodes-panel.tsx";
const lanesPath = "src/features/logistics/lanes-panel.tsx";

function source(path: string) { return existsSync(path) ? readFileSync(path, "utf8") : ""; }

describe("Logistics & Delivery admin workspace", () => {
  test("navigation exposes one owner-gated Logistics & Delivery entry", () => {
    expect((shell.match(/Logistics & Delivery/g) ?? []).length).toBe(1);
    expect(shell).toContain('href: "/admin/logistics"');
    expect(shell).toContain('permission: "logistics.manage"');
  });

  test("page is permission-gated and workspace exposes the four configuration tabs", () => {
    const page = source(pagePath), workspace = source(workspacePath);
    expect(page).toContain('can("logistics.manage")');
    expect(page).toContain("<LogisticsWorkspace");
    for (const label of ["Locations &amp; hubs", "Network lanes", "Workflows", "Route rules"]) expect(workspace).toContain(label);
    expect(workspace).toContain("min-w-0");
    expect(workspace).toContain("overflow-x-hidden");
  });

  test("nodes UX covers search, public presentation, dependencies and safe deactivation", () => {
    const nodes = source(nodesPath);
    for (const text of ["Search locations", "Node type", "Customer-visible", "Parent / group node", "Inventory location reference", "Public directions", "Public contact", "Dependencies", "Deactivate node"])
      expect(nodes).toContain(text);
    expect(nodes).toContain("apiOps.logisticsNodes");
    expect(nodes).toContain("apiOps.logisticsNodeCreate");
    expect(nodes).toContain("apiOps.logisticsNodeUpdate");
    expect(nodes).toContain("scrollIntoView");
    expect(nodes).toContain("ApiError");
    expect(nodes).toContain("setFormError");
    expect(nodes).not.toContain("setEditor(null); // conflict");
  });

  test("lanes UX exposes route configuration without implying provider connectivity", () => {
    const lanes = source(lanesPath);
    for (const text of ["Origin", "Destination", "Lane mode", "Typical minutes", "Service days", "Cutoff time", "Provider configuration key", "Deactivate lane"])
      expect(lanes).toContain(text);
    expect(lanes).toContain("configuration key only");
    expect(lanes).toContain("apiOps.logisticsLanes");
    expect(lanes).toContain("apiOps.logisticsLaneCreate");
    expect(lanes).toContain("apiOps.logisticsLaneUpdate");
    expect(lanes).toContain("filter((node) => node.id !== form?.originNodeId)");
    expect(lanes).toContain("scrollIntoView");
    expect(lanes).toContain("setFormError");
  });
});
