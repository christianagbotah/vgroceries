import {test} from "node:test";
import assert from "node:assert/strict";
import {itemizedOrderEmail,publicProductImage,emailProductImage} from "../src/notifications/itemized-order-email";
import {buildOrderEmail} from "../src/notifications/order-email-transport";
test("itemized receipt uses historical quantities and amounts, approved image URL only, escaped labels",()=>{
 const copy=itemizedOrderEmail({subject:"Order received",body:"Your order is pending payment."},{reference:"VG-EXAMPLE",subtotalMinor:2000,discountMinor:100,deliveryFeeMinor:500,totalMinor:2400,paymentStatus:"pending",lines:[{productName:"Rice <script>",variantName:"1kg",quantity:"2",unit:"bag",unitPriceMinor:1000,lineTotalMinor:2000,image:"/media/products/approved/rice.jpg"},{productName:"Oil",variantName:"",quantity:"1",unit:"bottle",unitPriceMinor:0,lineTotalMinor:0,image:"https://evil.example/x.jpg"}]});
 assert.match(copy.body,/Rice <script>/);assert.match(copy.body,/₵24\.00/);assert.match(copy.html,/Rice &lt;script&gt;/);assert.match(copy.html,/https:\/\/portal\.varietygroceries\.com\/media\/products\/approved\/rice.jpg/);assert.doesNotMatch(copy.html,/evil\.example|<script>/);
 for(const value of ["//evil.example/a.jpg","/media/private/a.jpg","/media/products/a.svg","/media/products/a.jpg?token=secret","https://portal.varietygroceries.com.evil.test/media/products/a.jpg"])assert.equal(publicProductImage(value),null);
 const mime=buildOrderEmail({enabled:true,from:"orders@example.test",sendmailPath:"/usr/sbin/sendmail"},{recipient:"customer@example.test",...copy});
 assert.match(mime,/multipart\/alternative/);assert.match(mime,/text\/plain/);assert.match(mime,/text\/html/);
});

test("large receipts remain within transport limits, with totals and tracking retained",()=>{
 const line={productName:"<&".repeat(60),variantName:"商品".repeat(60),quantity:"1",unit:"box",unitPriceMinor:100,lineTotalMinor:100,image:"/media/products/approved/rice.jpg"};
 const copy=itemizedOrderEmail({subject:"Order received",body:"Your order is confirmed."},{reference:"VG-EXAMPLE",subtotalMinor:10000,discountMinor:0,deliveryFeeMinor:0,totalMinor:10000,paymentStatus:"succeeded",lines:Array.from({length:100},()=>line)});
 assert.ok(Buffer.byteLength(copy.html,"utf8")<=20000);
 assert.ok(Buffer.byteLength(copy.body,"utf8")<=24000);
 assert.match(copy.html,/Additional items are available/);assert.match(copy.body,/₵100\.00/);
 assert.match(copy.html,/track\?reference=VG-EXAMPLE/);
 assert.doesNotThrow(()=>buildOrderEmail({enabled:true,from:"orders@example.test",sendmailPath:"/usr/sbin/sendmail"},{recipient:"customer@example.test",...copy}));
});


test("legacy catalogue photos use a canonical same-origin thumbnail proxy with no recipient data",()=>{
 const image=emailProductImage({published:true,image:"https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=900&q=84",featuredMedia:null});
 assert.ok(image);
 const proxy=new URL(image);
 assert.equal(proxy.origin,"https://portal.varietygroceries.com");
 assert.equal(proxy.pathname,"/_next/image");
 assert.equal(proxy.searchParams.get("url"),"https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=128&q=75");
 assert.equal(proxy.searchParams.get("w"),"128");
 const copy=itemizedOrderEmail({subject:"Order received",body:"Your order was placed."},{reference:"VG-EXAMPLE",subtotalMinor:100,discountMinor:0,deliveryFeeMinor:0,totalMinor:100,paymentStatus:"succeeded",lines:[{productName:"Water",variantName:"750ml",quantity:"1",unit:"bottle",unitPriceMinor:100,lineTotalMinor:100,image},{productName:"Invalid",variantName:"",quantity:"1",unit:"bottle",unitPriceMinor:0,lineTotalMinor:0,image:image+"&tracking=secret"}]});
 assert.match(copy.html,/portal\.varietygroceries\.com\/_next\/image\?/);
 assert.doesNotMatch(copy.html,/tracking=secret/);
 assert.equal(emailProductImage({published:false,image:"https://images.unsplash.com/photo-test",featuredMedia:null}),null);
 for(const value of ["https://evil.example/photo-test","https://images.unsplash.com/photo-test?token=secret","https://images.unsplash.com.evil.test/photo-test","https://images.unsplash.com/private","https://user@images.unsplash.com/photo-test"])
  assert.equal(emailProductImage({published:true,image:value,featuredMedia:null}),null);
 assert.equal(emailProductImage({published:true,image:"https://images.unsplash.com/photo-test",featuredMedia:{publicUrl:"/media/products/approved/water.jpg",status:"approved",archivedAt:null}}),"https://portal.varietygroceries.com/media/products/approved/water.jpg");
});
