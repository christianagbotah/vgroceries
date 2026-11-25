/** Use only assigned work contacts and authoritative order payment state. */
export type DeliverySmsContact={kind:"rider"|"courier";name:string;phone?:string|null};
export function outForDeliveryCopy(input:{
 reference:string;contact?:DeliverySmsContact|null;
 paymentMethod:string;paymentStatus:string;totalMinor:number;
}):string{
 if(!/^VG-[A-Z0-9]{8,32}$/.test(input.reference))throw Error("Invalid order reference.");
 const parts=[`Variety Groceries: Good news! Order ${input.reference} is on its way.`];
 const contact=input.contact;
 if(contact){
  const name=contact.name.replace(/[\u0000-\u001f\u007f]/g," ").replace(/\s+/g," ").trim().slice(0,80);
  const phone=contact.phone?.replace(/[\s()-]/g,"")??"";
  if(name)parts.push(`${contact.kind==="rider"?"Delivery rider":"Delivery partner"}: ${name}.`);
  if(/^(?:\+233[0-9]{9}|233[0-9]{9}|0[0-9]{9})$/.test(phone))parts.push(`Contact: ${phone}.`);
 }
 if(input.paymentMethod==="cash_on_delivery"&&input.paymentStatus==="unpaid"&&Number.isSafeInteger(input.totalMinor)&&input.totalMinor>0){
  const amount=new Intl.NumberFormat("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2}).format(input.totalMinor/100);
  // Use GSM-friendly currency text to avoid unnecessary Unicode SMS segments.
  parts.push(`Amount payable: GHS ${amount}. Kindly have the exact cash amount ready, as our rider may not have sufficient change.`);
 }else if(input.paymentStatus==="succeeded"){
  parts.push("Fully paid. No payment is required upon delivery.");
 }
 parts.push("Thank you for shopping with Variety Groceries.",`Track: https://portal.varietygroceries.com/track?reference=${input.reference}`);
 return parts.join("\n");
}
