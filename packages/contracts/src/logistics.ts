import { z } from "zod";

const idSchema = z.string().trim().min(1).max(128);
const shortTextSchema = z.string().trim().min(1).max(160);
const optionalTextSchema = z.string().trim().min(1).max(500).optional().nullable();
const isoTimestampSchema = z.string().datetime({ offset: true });

export const logisticsNodeKindSchema = z.enum([
  "head_office",
  "warehouse",
  "fulfilment_center",
  "hub",
  "outlet",
  "pickup_point",
  "cross_dock",
  "partner_facility",
  "other",
]);
export type LogisticsNodeKind = z.infer<typeof logisticsNodeKindSchema>;

export const logisticsLaneModeSchema = z.enum([
  "internal_transfer",
  "linehaul",
  "third_party",
  "customer_pickup",
  "last_mile",
]);
export type LogisticsLaneMode = z.infer<typeof logisticsLaneModeSchema>;

export const workflowVersionStatusSchema = z.enum(["draft", "published", "retired"]);
export type WorkflowVersionStatus = z.infer<typeof workflowVersionStatusSchema>;

export const routeDestinationKindSchema = z.enum(["doorstep", "pickup_point"]);
export type RouteDestinationKind = z.infer<typeof routeDestinationKindSchema>;

export const routeTerminalRoleSchema = z.enum(["transit", "customer_pickup", "final_mile_dispatch"]);
export type RouteTerminalRole = z.infer<typeof routeTerminalRoleSchema>;

export const workflowEventKindSchema = z.enum([
  "order_placed",
  "order_confirmed",
  "picking_started",
  "packed",
  "fulfilment_handed_over",
  "shipment_departed",
  "shipment_arrived",
  "shipment_handover",
  "shipment_rerouted",
  "shipment_delayed",
  "ready_for_pickup",
  "customer_collected",
  "rider_assigned",
  "rider_accepted",
  "rider_picked_up",
  "out_for_delivery",
  "delivery_failed",
  "delivery_rescheduled",
  "delivered",
  "returned_toward_store",
  "custom_checkpoint",
]);
export type WorkflowEventKind = z.infer<typeof workflowEventKindSchema>;

export const logisticsNodeInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: shortTextSchema,
  publicName: shortTextSchema,
  kind: logisticsNodeKindSchema,
  kindLabel: z.string().trim().min(1).max(80).optional().nullable(),
  parentNodeId: idSchema.optional().nullable(),
  inventoryLocationId: idSchema.optional().nullable(),
  addressLine: z.string().trim().max(240).optional().nullable(),
  locality: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  ghanaPostGps: z.string().trim().max(80).optional().nullable(),
  publicDirections: z.string().trim().max(500).optional().nullable(),
  publicContact: z.string().trim().max(160).optional().nullable(),
  customerVisible: z.boolean().default(true),
  active: z.boolean().default(true),
}).strict();
export const createLogisticsNodeRequestSchema = logisticsNodeInputSchema;
export type CreateLogisticsNodeRequest = z.infer<typeof createLogisticsNodeRequestSchema>;
export const updateLogisticsNodeRequestSchema = logisticsNodeInputSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "At least one node field is required.",
});
export type UpdateLogisticsNodeRequest = z.infer<typeof updateLogisticsNodeRequestSchema>;

export const logisticsNodeDependencySchema = z.object({
  activeIncomingLanes: z.number().int().nonnegative(),
  activeOutgoingLanes: z.number().int().nonnegative(),
  activeRouteRules: z.number().int().nonnegative(),
  childNodes: z.number().int().nonnegative(),
  inventoryLocationExists: z.boolean(),
  inventoryLocationActive: z.boolean(),
}).strict();

export const logisticsNodeViewSchema = logisticsNodeInputSchema.extend({
  id: idSchema,
  code: z.string().trim().min(1).max(64),
  dependencies: logisticsNodeDependencySchema.optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();
export type LogisticsNodeView = z.infer<typeof logisticsNodeViewSchema>;

const serviceDaysSchema = z.array(z.number().int().min(1).max(7)).max(7).default([]).superRefine((days, ctx) => {
  if (new Set(days).size !== days.length) ctx.addIssue({ code: "custom", message: "Service days must be unique." });
});

export const logisticsLaneInputSchema = z.object({
  originNodeId: idSchema,
  destinationNodeId: idSchema,
  mode: logisticsLaneModeSchema,
  providerKey: z.string().trim().min(1).max(80).optional().nullable(),
  typicalMinutes: z.number().int().min(1).max(10080),
  serviceDays: serviceDaysSchema.optional(),
  cutoffLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  priority: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
}).strict().refine((value) => value.originNodeId !== value.destinationNodeId, {
  message: "Origin and destination must differ.",
  path: ["destinationNodeId"],
});
export const createLogisticsLaneRequestSchema = logisticsLaneInputSchema;
export type CreateLogisticsLaneRequest = z.infer<typeof createLogisticsLaneRequestSchema>;
export const updateLogisticsLaneRequestSchema = z.object({
  originNodeId: idSchema.optional(),
  destinationNodeId: idSchema.optional(),
  mode: logisticsLaneModeSchema.optional(),
  providerKey: z.string().trim().min(1).max(80).optional().nullable(),
  typicalMinutes: z.number().int().min(1).max(10080).optional(),
  serviceDays: serviceDaysSchema.optional(),
  cutoffLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  priority: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
 }).strict().refine((value) => Object.keys(value).length > 0, { message: "At least one lane field is required." });
export type UpdateLogisticsLaneRequest = z.infer<typeof updateLogisticsLaneRequestSchema>;

export const logisticsLaneViewSchema = z.object({
  id: idSchema,
  originNodeId: idSchema,
  destinationNodeId: idSchema,
  mode: logisticsLaneModeSchema,
  providerKey: z.string().trim().min(1).max(80).optional().nullable(),
  typicalMinutes: z.number().int().min(1).max(10080),
  serviceDays: z.array(z.number().int().min(1).max(7)).max(7),
  cutoffLocalTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().nullable(),
  priority: z.number().int().nonnegative(),
  active: z.boolean(),
  origin: z.object({ id: idSchema, code: z.string(), publicName: z.string() }).strict().optional(),
  destination: z.object({ id: idSchema, code: z.string(), publicName: z.string() }).strict().optional(),
  activeRouteRuleCount: z.number().int().nonnegative().optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();
export type LogisticsLaneView = z.infer<typeof logisticsLaneViewSchema>;

export const workflowStageDefinitionSchema = z.object({
  id: idSchema.optional(),
  stageKey: z.string().trim().min(1).max(80),
  eventKind: workflowEventKindSchema,
  customerTitleTemplate: z.string().trim().min(1).max(160),
  customerDetailTemplate: z.string().trim().max(500).optional().nullable(),
  adminLabel: z.string().trim().min(1).max(160),
  adminHelpText: z.string().trim().max(500).optional().nullable(),
  customerVisible: z.boolean().default(true),
  showPlannedWhenPending: z.boolean().default(false),
  slaMinutes: z.number().int().positive().max(10080).optional().nullable(),
  sortOrder: z.number().int().positive(),
  displayGroup: z.string().trim().max(80).optional().nullable(),
  exceptionSeverity: z.enum(["info", "warning", "critical"]).default("info"),
  notificationsAllowed: z.boolean().default(false),
}).strict();
export type WorkflowStageDefinitionView = z.infer<typeof workflowStageDefinitionSchema>;

export const deliveryWorkflowVersionViewSchema = z.object({
  id: idSchema,
  templateId: idSchema,
  versionNumber: z.number().int().positive(),
  status: workflowVersionStatusSchema,
  defaultSlaMinutes: z.number().int().positive().max(10080).optional().nullable(),
  revision: z.number().int().positive(),
  createdBy: idSchema,
  createdAt: isoTimestampSchema,
  publishedBy: idSchema.optional().nullable(),
  publishedAt: isoTimestampSchema.optional().nullable(),
  stages: z.array(workflowStageDefinitionSchema),
}).strict();
export type DeliveryWorkflowVersionView = z.infer<typeof deliveryWorkflowVersionViewSchema>;

export const deliveryWorkflowViewSchema = z.object({
  id: idSchema,
  name: shortTextSchema,
  description: z.string().trim().max(500).optional().nullable(),
  active: z.boolean(),
  currentPublishedVersionId: idSchema.optional().nullable(),
  versions: z.array(deliveryWorkflowVersionViewSchema).default([]),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();
export type DeliveryWorkflowView = z.infer<typeof deliveryWorkflowViewSchema>;

export const createDeliveryWorkflowRequestSchema = z.object({
  name: shortTextSchema,
  description: z.string().trim().max(500).optional().nullable(),
  active: z.boolean().default(true),
 }).strict();
export type CreateDeliveryWorkflowRequest = z.infer<typeof createDeliveryWorkflowRequestSchema>;
export const saveDeliveryWorkflowDraftRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
  defaultSlaMinutes: z.number().int().positive().max(10080).optional().nullable(),
  stages: z.array(workflowStageDefinitionSchema.omit({ id: true })),
}).strict();
export type SaveDeliveryWorkflowDraftRequest = z.infer<typeof saveDeliveryWorkflowDraftRequestSchema>;
export const publishDeliveryWorkflowRequestSchema = z.object({
  versionId: idSchema,
  expectedRevision: z.number().int().positive(),
}).strict();
export type PublishDeliveryWorkflowRequest = z.infer<typeof publishDeliveryWorkflowRequestSchema>;

export const routeRuleStopSchema = z.object({
  id: idSchema.optional(),
  position: z.number().int().positive(),
  nodeId: idSchema,
  terminalRole: routeTerminalRoleSchema,
}).strict();
export type RouteRuleStop = z.infer<typeof routeRuleStopSchema>;

export const routeRuleLegSchema = z.object({
  id: idSchema.optional(),
  position: z.number().int().positive(),
  laneId: idSchema,
  originStopId: idSchema.optional(),
  destinationStopId: idSchema.optional(),
}).strict();
export type RouteRuleLeg = z.infer<typeof routeRuleLegSchema>;

const deliveryRouteRuleInputBaseSchema = z.object({
  name: shortTextSchema,
  originNodeId: idSchema,
  deliveryZoneId: idSchema.optional().nullable(),
  fulfilment: z.enum(["delivery", "collection"]),
  locality: z.string().trim().min(1).max(120).optional().nullable(),
  destinationKind: routeDestinationKindSchema,
  finalPickupNodeId: idSchema.optional().nullable(),
  serviceLevel: z.string().trim().min(1).max(80).optional().nullable(),
  workflowVersionId: idSchema,
  priority: z.number().int().nonnegative().default(0),
  effectiveFrom: isoTimestampSchema.optional().nullable(),
  effectiveTo: isoTimestampSchema.optional().nullable(),
  stops: z.array(routeRuleStopSchema).min(1),
  legs: z.array(routeRuleLegSchema).default([]),
}).strict();

function addRouteDestinationIssues(value: z.infer<typeof deliveryRouteRuleInputBaseSchema>, ctx: z.RefinementCtx) {
  if (value.destinationKind === "pickup_point" && !value.finalPickupNodeId) {
    ctx.addIssue({ code: "custom", path: ["finalPickupNodeId"], message: "Pickup routes require a final pickup node." });
  }
  if (value.destinationKind === "doorstep" && value.finalPickupNodeId) {
    ctx.addIssue({ code: "custom", path: ["finalPickupNodeId"], message: "Doorstep routes cannot set a final pickup node." });
  }
}

export const createDeliveryRouteRuleRequestSchema = deliveryRouteRuleInputBaseSchema.superRefine(addRouteDestinationIssues);
export type CreateDeliveryRouteRuleRequest = z.infer<typeof createDeliveryRouteRuleRequestSchema>;
export const updateDeliveryRouteRuleRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  name: shortTextSchema.optional(),
  deliveryZoneId: idSchema.optional().nullable(),
  locality: z.string().trim().min(1).max(120).optional().nullable(),
  destinationKind: routeDestinationKindSchema.optional(),
  finalPickupNodeId: idSchema.optional().nullable(),
  serviceLevel: z.string().trim().min(1).max(80).optional().nullable(),
  workflowVersionId: idSchema.optional(),
  priority: z.number().int().nonnegative().optional(),
  effectiveFrom: isoTimestampSchema.optional().nullable(),
  effectiveTo: isoTimestampSchema.optional().nullable(),
  active: z.boolean().optional(),
  stops: z.array(routeRuleStopSchema).min(1).optional(),
  legs: z.array(routeRuleLegSchema).optional(),
 }).strict();
export type UpdateDeliveryRouteRuleRequest = z.infer<typeof updateDeliveryRouteRuleRequestSchema>;
export const activateDeliveryRouteRuleRequestSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export type ActivateDeliveryRouteRuleRequest = z.infer<typeof activateDeliveryRouteRuleRequestSchema>;

export const deliveryRouteRuleViewSchema = deliveryRouteRuleInputBaseSchema.extend({
  id: idSchema,
  active: z.boolean(),
  version: z.number().int().positive(),
  createdBy: idSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}).strict();
export type DeliveryRouteRuleView = z.infer<typeof deliveryRouteRuleViewSchema>;

export const routeSimulationRequestSchema = z.object({
  originNodeId: idSchema,
  fulfilment: z.enum(["delivery", "collection"]),
  deliveryZoneId: idSchema.optional().nullable(),
  locality: z.string().trim().min(1).max(120).optional().nullable(),
  destinationKind: routeDestinationKindSchema,
  finalPickupNodeId: idSchema.optional().nullable(),
  serviceLevel: z.string().trim().min(1).max(80).optional().nullable(),
  at: isoTimestampSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.destinationKind === "pickup_point" && !value.finalPickupNodeId) {
    ctx.addIssue({ code: "custom", path: ["finalPickupNodeId"], message: "Pickup simulation requires a final pickup node." });
  }
  if (value.destinationKind === "doorstep" && value.finalPickupNodeId) {
    ctx.addIssue({ code: "custom", path: ["finalPickupNodeId"], message: "Doorstep simulation cannot set a final pickup node." });
  }
});
export type RouteSimulationRequest = z.infer<typeof routeSimulationRequestSchema>;

const routeSimulationStopSchema = z.object({
  position: z.number().int().positive(),
  nodeId: idSchema,
  nodeCode: z.string().trim().min(1).max(64),
  nodePublicName: shortTextSchema,
  terminalRole: routeTerminalRoleSchema,
}).strict();
const routeSimulationLegSchema = z.object({
  position: z.number().int().positive(),
  laneId: idSchema,
  mode: logisticsLaneModeSchema,
  originNodeId: idSchema,
  destinationNodeId: idSchema,
}).strict();
export const routeSimulationCandidateSchema = z.object({
  ruleId: idSchema,
  name: shortTextSchema,
  priority: z.number().int().nonnegative(),
  workflowVersionId: idSchema,
  destinationKind: routeDestinationKindSchema,
  stops: z.array(routeSimulationStopSchema).min(1),
  legs: z.array(routeSimulationLegSchema),
}).strict();
export type RouteSimulationCandidate = z.infer<typeof routeSimulationCandidateSchema>;

export const routeSimulationResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("matched"),
    selectedRule: routeSimulationCandidateSchema,
    candidates: z.array(routeSimulationCandidateSchema).min(1),
  }).strict(),
  z.object({ status: z.literal("no_match"), candidates: z.array(routeSimulationCandidateSchema).length(0) }).strict(),
  z.object({ status: z.literal("ambiguous"), candidates: z.array(routeSimulationCandidateSchema).min(2) }).strict(),
]);
export type RouteSimulationResponse = z.infer<typeof routeSimulationResponseSchema>;
