/// <reference types="bun-types" />
import {describe,expect,test} from "bun:test";
import {readFileSync} from "node:fs";
import {physicalReturnListSchema,physicalReturnQuerySchema} from "../packages/contracts/src/physical-returns";
import {restEndpoints} from "../packages/contracts/src/endpoints";

const source=readFileSync("src/app/admin/physical-returns/page.tsx","utf8");

describe("Physical receipt staff ledger pagination",()=>{
  test("existing administrator-only GET route and bounded query contract are used",()=>{
    expect(restEndpoints["admin.physical-returns"]).toMatchObject({method:"GET",path:"/admin/physical-returns"});
    expect(source).toContain("const PAGE_SIZE=20");
    expect(source).toContain("apiOps.physicalReturns({page:listPage,perPage:PAGE_SIZE,");
    expect(source).toContain("...(receiptOrderFilter?{orderId:receiptOrderFilter}:{})");
    expect(source).not.toContain("physicalReturns({perPage:50})");
    expect(physicalReturnQuerySchema.parse({page:"3",perPage:"20"})).toEqual({page:3,perPage:20});
    expect(physicalReturnQuerySchema.safeParse({page:"0"}).success).toBe(false);
    expect(physicalReturnQuerySchema.safeParse({perPage:"51"}).success).toBe(false);
  });
  test("the server's total drives the page count and the visible range",()=>{
    const data={enabled:false,claimLinkEnabled:false,custodyEnabled:false,
      resaleEnabled:false,page:3,perPage:20,total:59,items:[]};
    expect(physicalReturnListSchema.parse(data)).toEqual(data);
    expect(source).toContain("Math.ceil((list?.total??0)/PAGE_SIZE)");
    expect(source).toContain("list.total.toLocaleString()");
    expect(source).toContain("Page {list.page} of {pageCount}");
    expect(source).toContain("Showing {(list.page-1)*PAGE_SIZE+1}");
    expect(source).toContain("Previous page");
    expect(source).toContain("Next page");
  });
  test("late page responses are discarded and review drafts are cleared on navigation",()=>{
    expect(source).toContain("const version=++listRequestVersion.current");
    expect(source).toContain("if(version!==listRequestVersion.current)return");
    expect(source).toContain("return()=>{listRequestVersion.current++;}");
    expect(source).toContain("setTarget(null);setCustodyItem(null);setResaleItem(null)");
    expect(source).toContain("if(busy||listLoading||next<1||next>pageCount||next===listPage)return");
    expect(source).toContain("listRequestVersion.current++");
  });
  test("network errors never report a false globally empty ledger",()=>{
    expect(source).toContain("setList(null);setListError(friendly(e))");
    expect(source).toContain("This page cannot be verified; previous page data is not shown as current.");
    expect(source).toContain('list.total===0?"No verified physical receipts');
    expect(source).toContain("No physical receipts on this page. Use Previous page.");
    expect(source).toContain("Retry this page");
  });
  test("customer role cannot read staff-only receipts, and financial authority is unchanged",()=>{
    expect(source).toContain('const isAdmin=can("returns.decide")');
    expect(source).toContain("if(!isAdmin)return <div");
    expect(source).toContain("Administrator permission is required to view physical receipt");
    expect(source).toContain("isAdmin&&enabled&&!listLoading&&!listError");
    expect(source).not.toContain("apiOps.refundAction");
    expect(source).not.toContain("apiOps.paymentReconcile");
    expect(source).not.toContain("setPaymentStatus");
  });
  test("exact server-backed order filter is independent of physical intake and resets paging",()=>{
    expect(source).toContain('const [filterDraft,setFilterDraft]=useState(params.get("orderId")??"")');
    expect(source).toContain('const [receiptOrderFilter,setReceiptOrderFilter]=useState(params.get("orderId")??"")');
    expect(source).toContain("Exact order ID in receipt history");
    expect(source).toContain("Find receipts");
    expect(source).toContain("Clear filter");
    expect(source).toContain("setReceiptOrderFilter(exact);setListPage(1)");
    expect(source).toContain("const exact=value.trim()");
    expect(source).toContain("This filters the staff receipt history, not the physical-intake form");
  });
  test("successful intake resets to newest unfiltered page, not stale search history",()=>{
    expect(source).toContain("if(listPage!==1||receiptOrderFilter){");
    expect(source).toContain('setReceiptOrderFilter("");setListPage(1)');
    expect(source).toContain("else await refresh()");
    expect(source).toContain("no refund is inferred.");
    expect(source).toContain("This workflow never creates refunds");
  });
});