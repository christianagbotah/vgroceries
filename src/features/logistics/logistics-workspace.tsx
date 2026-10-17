"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NodesPanel } from "./nodes-panel";
import { LanesPanel } from "./lanes-panel";
import { MapPinned, Network, Route, Workflow } from "lucide-react";

export function LogisticsWorkspace() {
  return (
    <div className="min-w-0 space-y-5 overflow-x-hidden">
      <div>
        <h1 className="font-serif text-2xl font-bold">Logistics &amp; Delivery</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Configure facilities, transport lanes and delivery journeys. This configuration plans how orders may move; it does not itself prove that a parcel departed, arrived or was delivered.
        </p>
      </div>
      <Tabs defaultValue="nodes" className="min-w-0">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1">
          <TabsTrigger value="nodes" className="gap-1.5"><MapPinned className="size-4" aria-hidden /> Locations &amp; hubs</TabsTrigger>
          <TabsTrigger value="lanes" className="gap-1.5"><Network className="size-4" aria-hidden /> Network lanes</TabsTrigger>
          <TabsTrigger value="workflows" className="gap-1.5"><Workflow className="size-4" aria-hidden /> Workflows</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><Route className="size-4" aria-hidden /> Route rules</TabsTrigger>
        </TabsList>
        <TabsContent value="nodes" className="min-w-0"><NodesPanel /></TabsContent>
        <TabsContent value="lanes" className="min-w-0"><LanesPanel /></TabsContent>
        <TabsContent value="workflows" className="min-w-0">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-serif text-lg font-bold">Delivery workflows</h2>
            <p className="mt-1 text-sm text-muted-foreground">Workflow-version editing is the next configuration panel in this Wave L1 build.</p>
          </section>
        </TabsContent>
        <TabsContent value="rules" className="min-w-0">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-serif text-lg font-bold">Route rules</h2>
            <p className="mt-1 text-sm text-muted-foreground">Route-rule editing and simulation are the next configuration panel in this Wave L1 build.</p>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
