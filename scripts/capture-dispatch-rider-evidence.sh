#!/usr/bin/env bash
# Dispatch + Rider readiness — working-state screenshot evidence (2026-10-13).
# Drives the PRODUCTION build on :3000 through the real UI: dialogs, exception
# states, handover flow, rider lifecycle states. Non-destructive where possible
# (dialogs are opened but cancelled); stateful steps run last.
set -uo pipefail
BASE="http://localhost:3000"
OUT="docs/qa/evidence/zai-dispatch-rider-readiness-20261013"
ab() { agent-browser "$@"; }
settle() { sleep 1.5; }
clicktext() { ab eval "[...document.querySelectorAll('button')].find(b => (b.textContent||'').includes('$1'))?.click()"; }
shot() { ab screenshot "$OUT/$1"; }

# ---------- desktop 1440: dispatch control centre states ----------
ab set viewport 1440 900
ab storage local set vg-staff-role-v1 dispatcher
ab open "$BASE/admin/dispatch"; settle
# assignment modal
clicktext "Assign rider or provider"; settle
shot "extra/admin-dispatch-assignment-modal-1440px.png"
ab press Escape; settle
# active delivery card detail
ab eval "document.querySelector('#ds-active')?.scrollIntoView({block:'start'})" > /dev/null; settle
shot "extra/admin-dispatch-active-deliveries-1440px.png"
# exceptions section
ab eval "document.querySelector('#ds-exceptions')?.scrollIntoView({block:'start'})" > /dev/null; settle
shot "extra/admin-dispatch-exceptions-rescheduled-1440px.png"

# ---------- desktop 1440: fulfilment handover (stock-consuming event) ----------
ab storage local set vg-staff-role-v1 operations_manager
ab open "$BASE/admin/fulfilment"; settle
ab eval "[...document.querySelectorAll('[role=tab]')].find(t => (t.textContent||'').includes('handover'))?.click()" > /dev/null; settle
shot "extra/admin-fulfilment-handover-tab-1440px.png"
clicktext "Hand over to dispatch"; settle
shot "extra/admin-fulfilment-handover-confirm-dialog-1440px.png"
ab press Escape; settle

# ---------- mobile 390: rider lifecycle states ----------
ab set viewport 390 844
# rescheduled job as Kwabena
ab storage local set vg-rider-id-v1 rdr_kwabena
ab open "$BASE/rider/jobs/job_5002"; settle
shot "mobile/rider-job-rescheduled-390px.png"
# POD + fail dialogs as Yaw on the out-for-delivery job
ab storage local set vg-rider-id-v1 rdr_yaw
ab open "$BASE/rider/jobs/job_5001"; settle
shot "mobile/rider-job-out-for-delivery-full-390px.png"
clicktext "Mark delivered"; settle
shot "mobile/rider-pod-dialog-390px.png"
ab press Escape; settle
clicktext "Report failed delivery"; settle
shot "mobile/rider-failed-delivery-dialog-390px.png"
ab press Escape; settle

# ---------- stateful (run last): assigned job + returned-to-store ----------
# assign the canonical awaiting-assignment order to Abena via the real API
JOBID=$(curl -s -X POST "$BASE/api/mock/v1/admin/dispatch/assign" -H "Content-Type: application/json" \
  -d '{"orderId":"ord_1015","riderId":"rdr_abena","actor":"stf_dela"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['data']['jobId'])")
echo "assigned job: $JOBID"
ab storage local set vg-rider-id-v1 rdr_abena
ab open "$BASE/rider/jobs/$JOBID"; settle
shot "mobile/rider-job-assigned-390px.png"
# return the rescheduled job to store -> terminal state on dispatch
curl -s -X POST "$BASE/api/mock/v1/admin/dispatch/job.action" -H "Content-Type: application/json" \
  -d '{"action":"return_to_store","jobId":"job_5002","note":"customer unreachable after two attempts","actor":"stf_dela"}' > /dev/null
ab set viewport 1440 900
ab storage local set vg-staff-role-v1 dispatcher
ab open "$BASE/admin/dispatch"; settle
ab eval "document.querySelector('#ds-history')?.scrollIntoView({block:'start'})" > /dev/null; settle
shot "extra/admin-dispatch-returned-to-store-1440px.png"

echo "working-state evidence captured"
