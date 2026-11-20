import type {Metadata} from "next";
import {ManualReader} from "@/features/manual/reader";

export const metadata:Metadata={
  title:"Rider guide | Variety Groceries",
  description:"Illustrated rider demo and verified COD workflow guide.",
  robots:{index:false,follow:false},
};
export default function RiderGuidePage(){
  // This fallback provides ONLY rider/customer-safe training while unauthenticated.
  // It does not grant rider backend permissions or unlock admin chapters.
  return <ManualReader guestScope="rider"/>;
}
