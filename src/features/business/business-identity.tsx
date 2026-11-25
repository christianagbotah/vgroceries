"use client";
import {createContext,useContext,type ReactNode} from "react";
import type {PublicBusinessIdentity} from "@/services/contracts";

const IdentityContext=createContext<PublicBusinessIdentity>({businessName:"Storefront"});
export function BusinessIdentityProvider({identity,children}:{identity:PublicBusinessIdentity;children:ReactNode}){
 return <IdentityContext.Provider value={identity}>{children}</IdentityContext.Provider>;
}
export function useBusinessIdentity(){return useContext(IdentityContext);}
