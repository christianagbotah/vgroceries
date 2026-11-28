import type {Metadata} from "next";
import {ManualReader} from "@/features/manual/reader";

export const metadata:Metadata={
  title:"User manual and workflows | Variety Groceries",
  description:"Role-aware system guide for Variety Groceries shopping, administration, cashier and rider workflows.",
  robots:{index:false,follow:false},
};
export default function UserManualPage(){
  return <ManualReader/>;
}
