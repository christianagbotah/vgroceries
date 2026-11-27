import {test,expect} from "bun:test";
import {orderFulfilmentRequest} from "./order-fulfilment-action";
import {restEndpoints} from "./contracts/endpoints";
import {validateRequest} from "./contracts/validation";
test("real confirmation uses strict fulfilment command, not financial action",()=>{
 const result=orderFulfilmentRequest({orderId:"order-1",action:"confirm",actor:"untrusted"});
 expect(result).toEqual({op:"admin.verified.fulfilment.confirm",query:{orderId:"order-1"},body:{},idempotencyKey:"fulfilment:confirm:order-1"});
 expect(restEndpoints[result!.op].path).toBe("/admin/fulfilment/orders/{orderId}/confirm");
 expect(restEndpoints[result!.op].replayTransport).toBe("headerOnly");
 expect(validateRequest(result!.op,result!.body).ok).toBe(true);
 expect(validateRequest(result!.op,{actor:"forged"}).ok).toBe(false);
 expect(orderFulfilmentRequest({orderId:"order-1",action:"cancel"})).toBeNull();
 expect(orderFulfilmentRequest({orderId:"order-1",action:"picking"})?.op).toBe("admin.verified.fulfilment.start-picking");
 expect(orderFulfilmentRequest({orderId:"order-1",action:"collect"})?.op).toBe("admin.verified.fulfilment.handover");
});
