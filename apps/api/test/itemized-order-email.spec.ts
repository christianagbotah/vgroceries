import {test} from "node:test";
import assert from "node:assert/strict";
import {itemizedOrderEmail,publicProductImage} from "../src/notifications/itemized-order-email";
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
