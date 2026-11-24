"use client";
import {useEffect,useState} from "react";
import {api} from "@/services/client";
import {publicBusinessContactSchema,type PublicBusinessContact} from "@/services/contracts";

export function usePublicBusinessContact(){
 const [contact,setContact]=useState<PublicBusinessContact|null>(null);
 useEffect(()=>{
  let active=true;
  // Never display fictional contact details in demo mode or if the backend is unavailable.
  if(!process.env.NEXT_PUBLIC_API_BASE_URL)return;
  api<unknown>("content.business-contact").then(value=>{
   const parsed=publicBusinessContactSchema.safeParse(value);
   if(active)setContact(parsed.success?parsed.data:null);
  }).catch(()=>{if(active)setContact(null);});
  return()=>{active=false;};
 },[]);
 return contact;
}
export function BusinessContact({className}:{className?:string}){
 const contact=usePublicBusinessContact();
 if(!contact||![contact.supportPhone,contact.supportEmail,contact.address,contact.operatingHours].some(Boolean))return null;
 return <div className={className}>
 {contact.supportPhone&&<p>Phone: <a className="break-words underline" href={"tel:"+contact.supportPhone}>{contact.supportPhone}</a></p>}
 {contact.supportEmail&&<p>Email: <a className="break-all underline" href={"mailto:"+contact.supportEmail}>{contact.supportEmail}</a></p>}
 {contact.address&&<p>{contact.address}</p>}
 {contact.operatingHours&&<p>Hours: {contact.operatingHours}</p>}
 </div>;
}
