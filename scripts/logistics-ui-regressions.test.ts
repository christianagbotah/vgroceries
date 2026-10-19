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

const workflowsPath = "src/features/logistics/workflows-panel.tsx";

describe("Logistics immutable workflow builder", () => {
  test("workspace mounts workflow builder with version history and draft-only controls", () => {
    const workspace = source(workspacePath), workflows = source(workflowsPath);
    expect(workspace).toContain("<WorkflowsPanel");
    expect(workflows).toContain("Version history");
    expect(workflows).toContain("Current published");
    expect(workflows).toContain("Create workflow template");
    expect(workflows).toContain("Clone as new draft");
    expect(workflows).toMatch(/version\.status\s*===\s*"draft"/);
    expect(workflows).toContain("Read-only published version");
    expect(workflows).toContain("Publish workflow");
  });

  test("stage editor distinguishes protected system events from customer display labels", () => {
    const workflows = source(workflowsPath);
    expect(workflows).toContain("System event");
    expect(workflows).toContain("Display label");
    expect(workflows).toContain("custom_checkpoint");
    expect(workflows).toContain("informational only");
    expect(workflows).toContain("Move up");
    expect(workflows).toContain("Move down");
    for (const field of ["Customer detail", "Admin label", "Admin help", "SLA minutes", "Display group", "Exception severity", "Notification-eligible"])
      expect(workflows).toContain(field);
  });

  test("preview stays presentation-only and stale revisions preserve local draft content", () => {
    const workflows = source(workflowsPath);
    expect(workflows).toContain("Preview");
    expect(workflows).toContain("Planned — not completed");
    expect(workflows).not.toContain("Preview completed");
    expect(workflows).toContain("This workflow changed elsewhere");
    expect(workflows).toContain("Reload server version");
    expect(workflows).toContain("setDraftError");
    expect(workflows).toContain("apiOps.logisticsWorkflowSave");
    expect(workflows).toContain("apiOps.logisticsWorkflowPublish");
    expect(workflows).toContain("apiOps.logisticsWorkflowDraft");
  });
});

const routeRulesPath = "src/features/logistics/route-rules-panel.tsx";

describe("Logistics route rules and simulation", () => {
  test("workspace mounts route rules with explicit selection authority", () => {
    const workspace = source(workspacePath), rules = source(routeRulesPath);
    expect(workspace).toContain("<RouteRulesPanel");
    for (const text of ["Active", "Inactive", "Priority", "Effective from", "Effective to", "Origin", "Delivery zone", "Locality", "Service level", "Workflow version", "Destination kind"])
      expect(rules).toContain(text);
    expect(rules).toContain("Higher number wins; two matching rules with the same highest priority are blocked as ambiguous.");
    expect(rules).toContain("apiOps.logisticsRouteRuleCreate");
    expect(rules).toContain("apiOps.logisticsRouteRuleUpdate");
  });

  test("editor encodes collection, pickup, doorstep and direct-route semantics explicitly", () => {
    const rules = source(routeRulesPath);
    expect(rules).toContain('form.fulfilment === "collection"');
    expect(rules).toMatch(/destinationKind\s*:\s*"doorstep"/);
    expect(rules).toMatch(/terminalRole\s*:\s*"customer_pickup"/);
    expect(rules).toContain('form.destinationKind === "pickup_point"');
    expect(rules).toMatch(/terminalRole[^\n]*"final_mile_dispatch"/);
    expect(rules).toContain("Direct doorstep");
    expect(rules).toContain("No lane is required when origin is already the final-mile dispatch point.");
    expect(rules).toContain("active rules are read-only");
    expect(rules).toContain("Adjacent lane");
  });

  test("simulation renders matched no-match and ambiguity without mutating route authority", () => {
    const rules = source(routeRulesPath);
    expect(rules).toContain("Route simulation");
    expect(rules).toContain("apiOps.logisticsRouteRuleSimulate");
    expect(rules).toContain("Matched");
    expect(rules).toContain("No route configured");
    expect(rules).toContain("Ambiguous");
    expect(rules).toContain("conflicting rule");
    expect(rules).toContain("apiOps.logisticsRouteRuleActivate");
    expect(rules).toContain("Activate with server preflight");
    expect(rules).toContain("setActionError");
  });
});
