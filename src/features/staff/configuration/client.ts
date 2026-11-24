import { api } from "@/services/client";
import { resolveClientAdapter, ApiError } from "@/services/adapters/browser";

export type BusinessInput = {version:number;businessName:string;supportPhone:string;supportEmail:string;address:string;registrationNumber:string;operatingHours:string;receiptFooter:string};
export type BusinessProfile = BusinessInput & {id:string;currency:string;updatedAt:string};
export type PartnerInput = {name:string;contactPhone:string;contactEmail:string;coverage:string;notes:string;active:boolean};
export type Partner = PartnerInput & {id:string;version:number;updatedAt:string;integrationMode:"manual";apiConnected:false};
export type IntegrationId = "hubtel-checkout"|"hubtel-sms"|"paystack-payment";
export type IntegrationStatus = {vaultReady:boolean;providers:{id:IntegrationId;draft:{version:number;updatedAt:string}|null;runtimeConfigured:boolean;activationSupported:false}[]};
export function requireRealAdminTransport() {
  if (resolveClientAdapter().kind !== "http:api") throw new ApiError("UNAVAILABLE","Sign in with a real administrator account to manage persistent configuration. Demo sessions cannot save these settings.");
}
export const configurationApi = {
  business:async()=>{requireRealAdminTransport();return api<BusinessProfile>("admin.business.profile");},
  saveBusiness:(body:BusinessInput)=>{requireRealAdminTransport();return api<BusinessProfile>("admin.business.save",{body});},
  partners:async()=>{requireRealAdminTransport();return api<Partner[]>("admin.delivery.partners");},
  createPartner:(body:PartnerInput)=>{requireRealAdminTransport();return api<Partner>("admin.delivery.partner.create",{body});},
  updatePartner:(id:string,body:PartnerInput & {version:number})=>{requireRealAdminTransport();return api<Partner>("admin.delivery.partner.update",{query:{id},body});},
  credentials:async()=>{requireRealAdminTransport();return api<IntegrationStatus>("admin.integration.credentials");},
  saveDraft:(id:IntegrationId,version:number,credentials:Record<string,string>)=>{
    // Never allow secrets to enter the demo adapter or client-side storage.
    requireRealAdminTransport();
    return api<{id:IntegrationId;version:number;updatedAt:string;activationSupported:false}>("admin.integration.draft.save",{query:{id},body:{version,credentials}});
  },
};
