# FNC ERP — Notification System Design Specification

> This document catalogues every system event that should generate a notification.
> For each event the table shows: who fires it, who receives it, the channel, the priority,
> the message template, and the escalation schedule (where applicable).
>
> **Channels:** In-App = sidebar bell panel · Email = HTML email via Nodemailer
> **Priority levels:** `low` `normal` `high` `urgent` `critical`
> **Status key:** ✅ Implemented · 🔲 Pending

---

## 1 · Engineering Documents

> Two-track workflow: Track 1 = internal review chain · Track 2 = client issue codes + responses.
> Checker/approver are resolved by name from the `employees` table.

### 1.1 — Send for Internal Check ✅

| Field | Value |
|-------|-------|
| **Trigger** | `send_for_check` workflow action |
| **Fired by** | Originator |
| **Recipient** | Checker |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Review Required: {docRef}` |
| **Body** | `{fromName} has sent "{docTitle}" for your internal check on project {projectName}. Response due by {dueDate}.` |
| **Email type** | `assigned` |

**Escalation** — reminder row created in `eng_doc_review_reminders` (role = `checker`):

| reminder_count | Days after due | Priority | PM escalation |
|---|---|---|---|
| 0 | +1 day | `normal` (overdue) | No |
| 1 | +2 days | `high` (urgent) | No |
| 2 | +4 days | `urgent` (urgent) | No |
| 3+ | +7 days | `critical` | Yes — PM also notified |

---

### 1.2 — Send for Approval ✅

| Field | Value |
|-------|-------|
| **Trigger** | `send_for_approval` workflow action |
| **Fired by** | Checker |
| **Recipient** | Approver |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Approval Required: {docRef}` |
| **Body** | `{fromName} has forwarded "{docTitle}" for your approval on project {projectName}. Response due by {dueDate}.` |
| **Email type** | `assigned` |

**Escalation** — same schedule as 1.1, role = `approver`. Checker reminder row resolved when this fires.

---

### 1.3 — Returned to Author ✅

| Field | Value |
|-------|-------|
| **Trigger** | `return_to_author` workflow action |
| **Fired by** | Checker or Approver |
| **Recipient** | Originator |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Document Returned: {docRef}` |
| **Body** | `{fromName} has returned "{docTitle}" to you for revision. Notes: {notes}` |
| **Email type** | `returned` |

**Escalation** — None. All open reminders for the document are resolved.

---

### 1.4 — Returned to Checker ✅

| Field | Value |
|-------|-------|
| **Trigger** | `return_to_checker` workflow action |
| **Fired by** | Approver |
| **Recipient** | Checker |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Re-Check Required: {docRef}` |
| **Body** | `{fromName} has returned "{docTitle}" for re-check on project {projectName}. Notes: {notes}` |
| **Email type** | `returned` |

---

### 1.5 — Approved for Issue ✅

| Field | Value |
|-------|-------|
| **Trigger** | `approve_for_issue` workflow action |
| **Fired by** | Approver |
| **Recipient** | Originator |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Approved for Issue: {docRef}` |
| **Body** | `{fromName} has approved "{docTitle}" for issue on project {projectName}. The document is now Ready to Issue.` |
| **Email type** | `approved` |

---

### 1.6 — Issued to Client ✅

| Field | Value |
|-------|-------|
| **Trigger** | `issue` workflow action (IFA / IFR / IFC / IFI) |
| **Fired by** | Originator |
| **Recipient** | Originator + Approver (if different) |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Document Issued: {docRef}` |
| **Body** | `"{docTitle}" has been issued to the client via transmittal {transmittalRef} on project {projectName}.` |
| **Email type** | `issued` |

---

### 1.7 — Client Response Recorded ✅

| Field | Value |
|-------|-------|
| **Trigger** | `record_client_response` workflow action |
| **Fired by** | Admin/PM |
| **Recipient** | Originator + Approver (if different) |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Client Response: {docRef} — Code {responseCode}` |
| **Body** | `Client responded to "{docTitle}" with code {responseCode}. Recorded by {fromName} on project {projectName}.` |
| **Email type** | `client_response` |

Response code meaning reminder (for email body):
- **A** — Approved / No Comments
- **B** — Approved with Comments
- **C** — Revise and Resubmit
- **D** — Rejected

---

## 2 · Technical Queries (TQ)

> A TQ is raised by the contractor to clarify design/specification issues. The engineer reviews and responds.

### 2.1 — TQ Raised

| Field | Value |
|-------|-------|
| **Trigger** | TQ record created / status → `open` |
| **Fired by** | Contractor contact (or internal user on their behalf) |
| **Recipient** | Assigned Engineer |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `New TQ: {tqRef} — {projectName}` |
| **Body** | `A Technical Query has been raised on project {projectName}. TQ: {tqRef} — {subject}. Response due by {dueDate}.` |

**Escalation:**

| Days past due | Priority | PM notified? |
|---|---|---|
| 1 day | `high` | No |
| 3 days | `urgent` | No |
| 7 days | `critical` | Yes |

---

### 2.2 — TQ Response Issued

| Field | Value |
|-------|-------|
| **Trigger** | TQ status → `answered` |
| **Fired by** | Engineer |
| **Recipient** | PM + TQ Originator |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `TQ Answered: {tqRef}` |
| **Body** | `{fromName} has answered TQ {tqRef} — "{subject}" on project {projectName}.` |

---

### 2.3 — TQ Closed

| Field | Value |
|-------|-------|
| **Trigger** | TQ status → `closed` |
| **Fired by** | PM or Admin |
| **Recipient** | Assigned Engineer + Originator |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `TQ Closed: {tqRef}` |
| **Body** | `TQ {tqRef} on project {projectName} has been closed.` |

---

## 3 · Contractor Deviation Requests (CDR)

> CDRs require a formal approval chain: Engineer → PM → Client (if applicable).

### 3.1 — CDR Submitted for Review

| Field | Value |
|-------|-------|
| **Trigger** | CDR created / status → `pending_review` |
| **Fired by** | Contractor (or PM on their behalf) |
| **Recipient** | Assigned Engineer |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `CDR Review Required: {cdrRef}` |
| **Body** | `A Contractor Deviation Request requires your review on project {projectName}. CDR: {cdrRef} — {description}. Due: {dueDate}.` |

**Escalation:** Same 3-tier schedule as TQs.

---

### 3.2 — CDR Approved

| Field | Value |
|-------|-------|
| **Trigger** | CDR status → `approved` |
| **Fired by** | Engineer / PM |
| **Recipient** | PM + CDR Originator |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `CDR Approved: {cdrRef}` |
| **Body** | `{fromName} has approved CDR {cdrRef} on project {projectName}.` |

---

### 3.3 — CDR Rejected

| Field | Value |
|-------|-------|
| **Trigger** | CDR status → `rejected` |
| **Fired by** | Engineer / PM |
| **Recipient** | PM + CDR Originator |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `CDR Rejected: {cdrRef}` |
| **Body** | `{fromName} has rejected CDR {cdrRef} on project {projectName}. Reason: {notes}.` |

---

## 4 · Variation Orders (VO)

### 4.1 — VO Submitted for Approval

| Field | Value |
|-------|-------|
| **Trigger** | VO status → `submitted` |
| **Fired by** | PM / Cost Engineer |
| **Recipient** | Project Director + Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Variation Order Approval: {voRef}` |
| **Body** | `Variation Order {voRef} of {amount} {currency} has been submitted for approval on project {projectName}. Submitted by {fromName}.` |

**Escalation:**

| Days without decision | Priority | Who is notified |
|---|---|---|
| 3 days | `high` | Project Director |
| 7 days | `urgent` | Project Director + COO |
| 14 days | `critical` | All above + system admin |

---

### 4.2 — VO Approved / Rejected

| Field | Value |
|-------|-------|
| **Trigger** | VO status → `approved` or `rejected` |
| **Fired by** | Approver |
| **Recipient** | PM |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `VO {approved/rejected}: {voRef}` |
| **Body** | `{fromName} has {approved/rejected} VO {voRef} on project {projectName}. {notes if rejected}` |

---

### 4.3 — VO Signed by Client

| Field | Value |
|-------|-------|
| **Trigger** | VO status → `client_signed` |
| **Fired by** | PM / Admin |
| **Recipient** | Finance Manager + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `VO Client-Signed: {voRef}` |
| **Body** | `Client has signed VO {voRef} for {amount} {currency} on project {projectName}. Contract value updated.` |

---

## 5 · Purchase Orders

### 5.1 — PO Submitted for Approval

| Field | Value |
|-------|-------|
| **Trigger** | PO status → `pending_approval` |
| **Fired by** | Requestor |
| **Recipient** | Next approver in chain |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `PO Approval Required: {poNumber}` |
| **Body** | `{fromName} has submitted PO {poNumber} for approval. Vendor: {vendorName}. Total: {amount} {currency}. Project: {projectName}.` |

**Escalation:**

| Hours without action | Priority | Action |
|---|---|---|
| 24 hours | `high` | Reminder to approver |
| 48 hours | `urgent` | Reminder + notify requester |
| 72 hours | `critical` | Escalate to procurement manager |

---

### 5.2 — PO Approved

| Field | Value |
|-------|-------|
| **Trigger** | PO status → `approved` |
| **Fired by** | Approver |
| **Recipient** | Requestor |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `PO Approved: {poNumber}` |
| **Body** | `Your PO {poNumber} to {vendorName} has been approved by {fromName}.` |

---

### 5.3 — PO Rejected

| Field | Value |
|-------|-------|
| **Trigger** | PO status → `rejected` |
| **Fired by** | Approver |
| **Recipient** | Requestor |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `PO Rejected: {poNumber}` |
| **Body** | `Your PO {poNumber} was rejected by {fromName}. Reason: {rejectionReason}.` |

---

### 5.4 — PO Goods Received

| Field | Value |
|-------|-------|
| **Trigger** | GRN created against PO |
| **Fired by** | Warehouse / Receiver |
| **Recipient** | Requestor + Procurement Manager |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Goods Received: {poNumber}` |
| **Body** | `Items have been received against PO {poNumber} from {vendorName}. Received by {receiverName}.` |

---

### 5.5 — PO Budget Overrun Alert

| Field | Value |
|-------|-------|
| **Trigger** | PO amount causes budget code to exceed threshold |
| **Fired by** | System (on PO approval) |
| **Recipient** | PM + Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `urgent` |
| **Title** | `Budget Alert: {costCode} Overrun` |
| **Body** | `Approving PO {poNumber} will cause cost code {costCode} on project {projectName} to reach {spendPercent}% of budget ({spentAmount} / {budgetAmount} {currency}).` |

---

### 5.6 — PO Edit Request

| Field | Value |
|-------|-------|
| **Trigger** | PO edit request submitted (after approval) |
| **Fired by** | Requestor |
| **Recipient** | Original approver |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `PO Edit Request: {poNumber}` |
| **Body** | `{fromName} has requested an edit to approved PO {poNumber}. Reason: {reason}.` |

---

## 6 · RFQ / Request for Quotation

### 6.1 — RFQ Published to Vendors

| Field | Value |
|-------|-------|
| **Trigger** | RFQ status → `published` |
| **Fired by** | Procurement Officer |
| **Recipient** | Invited vendors (email only — external) + Procurement Manager |
| **Channel** | Email (vendors) + In-App (internal) |
| **Priority** | `normal` |
| **Title** | `RFQ Invitation: {rfqRef}` |
| **Body** | `You have been invited to submit a quotation for {rfqRef}. Submission deadline: {deadline}. Login to vendor portal to respond.` |

---

### 6.2 — RFQ Response Received

| Field | Value |
|-------|-------|
| **Trigger** | Vendor submits quotation |
| **Fired by** | System |
| **Recipient** | Procurement Officer |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Quotation Received: {rfqRef}` |
| **Body** | `{vendorName} has submitted a quotation for {rfqRef}.` |

---

### 6.3 — RFQ Deadline Approaching

| Field | Value |
|-------|-------|
| **Trigger** | Cron: 48 hours before RFQ deadline, if < 2 responses received |
| **Fired by** | System |
| **Recipient** | Procurement Officer |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `RFQ Deadline in 48h: {rfqRef}` |
| **Body** | `RFQ {rfqRef} closes in 48 hours. Only {responseCount} vendor response(s) received so far.` |

---

## 7 · Subcontracts

### 7.1 — Subcontract Signed

| Field | Value |
|-------|-------|
| **Trigger** | Subcontract status → `active` |
| **Fired by** | PM / Admin |
| **Recipient** | Finance Manager + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Subcontract Signed: {subcontractRef}` |
| **Body** | `Subcontract {subcontractRef} with {subcontractorName} for {contractValue} {currency} on project {projectName} is now active.` |

---

### 7.2 — Subcontract Expiry Warning

| Field | Value |
|-------|-------|
| **Trigger** | Cron: 30 days and 7 days before subcontract end date |
| **Fired by** | System |
| **Recipient** | PM + Contracts Manager |
| **Channel** | In-App + Email |
| **Priority** | 30 days = `normal` · 7 days = `urgent` |
| **Title** | `Subcontract Expiring in {N} Days: {subcontractRef}` |
| **Body** | `Subcontract {subcontractRef} with {subcontractorName} on project {projectName} expires on {endDate}. Please arrange renewal or close-out.` |

---

### 7.3 — Subcontractor Submittal Due

| Field | Value |
|-------|-------|
| **Trigger** | Submittal planned date reached and status still `pending` |
| **Fired by** | System |
| **Recipient** | PM + Engineer assigned |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Submittal Overdue: {submittalRef}` |
| **Body** | `Submittal {submittalRef} — "{description}" on project {projectName} was due on {dueDate} and has not been received.` |

**Escalation:** +3 days = `urgent` + notify Project Director.

---

## 8 · Client Billing / Project Invoices

### 8.1 — Invoice Issued to Client

| Field | Value |
|-------|-------|
| **Trigger** | Invoice status → `issued` |
| **Fired by** | Finance / PM |
| **Recipient** | Finance Manager + PM |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Invoice Issued: {invoiceRef}` |
| **Body** | `Invoice {invoiceRef} for {amount} {currency} has been issued to {clientName} on project {projectName}.` |

---

### 8.2 — Invoice Overdue (Not Paid)

| Field | Value |
|-------|-------|
| **Trigger** | Cron: invoice status = `issued` and due date < today |
| **Fired by** | System |
| **Recipient** | Finance Manager + PM |
| **Channel** | In-App + Email |
| **Priority** | `high` → `urgent` (7+ days) → `critical` (30+ days) |
| **Title** | `Overdue Invoice: {invoiceRef} — {N} days` |
| **Body** | `Invoice {invoiceRef} for {amount} {currency} on project {projectName} is now {N} days overdue. Client: {clientName}.` |

---

### 8.3 — Retention Released

| Field | Value |
|-------|-------|
| **Trigger** | Invoice marked as retention release |
| **Fired by** | Finance / PM |
| **Recipient** | Finance Manager + PM |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Retention Released: {invoiceRef}` |
| **Body** | `Retention of {amount} {currency} has been released via invoice {invoiceRef} on project {projectName}.` |

---

## 9 · Vendor Invoices (Accounts Payable)

### 9.1 — Vendor Invoice Received

| Field | Value |
|-------|-------|
| **Trigger** | Vendor invoice created |
| **Fired by** | Finance / AP Clerk |
| **Recipient** | Finance Manager |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Vendor Invoice Received: {invoiceRef}` |
| **Body** | `Invoice {invoiceRef} from {vendorName} for {amount} {currency} has been logged.` |

---

### 9.2 — Vendor Invoice Due Soon

| Field | Value |
|-------|-------|
| **Trigger** | Cron: 5 days before invoice due date |
| **Fired by** | System |
| **Recipient** | Finance Manager + AP Clerk |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Payment Due in 5 Days: {invoiceRef}` |
| **Body** | `Invoice {invoiceRef} from {vendorName} for {amount} {currency} is due on {dueDate}. Please process payment.` |

---

### 9.3 — WHT Certificate Ready

| Field | Value |
|-------|-------|
| **Trigger** | WHT amount calculated on payment |
| **Fired by** | System |
| **Recipient** | Finance Manager |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `WHT Certificate Generated` |
| **Body** | `Withholding tax certificate generated for payment to {vendorName}. WHT amount: {whtAmount} {currency}.` |

---

## 10 · Meetings & Action Items

### 10.1 — Meeting Scheduled

| Field | Value |
|-------|-------|
| **Trigger** | Meeting record created |
| **Fired by** | Organizer |
| **Recipient** | All attendees |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Meeting Scheduled: {meetingTitle}` |
| **Body** | `{organizerName} has scheduled "{meetingTitle}" for {meetingDate} on project {projectName}. Location: {location}.` |

---

### 10.2 — Action Item Assigned

| Field | Value |
|-------|-------|
| **Trigger** | Meeting action item created with assignee |
| **Fired by** | Meeting organizer / minutes recorder |
| **Recipient** | Assignee |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Action Item Assigned: {actionRef}` |
| **Body** | `You have been assigned an action item from the meeting "{meetingTitle}" on project {projectName}. Action: {description}. Due: {dueDate}.` |

**Escalation:**

| Days past due | Priority | Who is notified |
|---|---|---|
| 1 day | `high` | Assignee |
| 3 days | `urgent` | Assignee + PM |
| 7 days | `critical` | Assignee + PM + organizer |

---

### 10.3 — Action Item Completed

| Field | Value |
|-------|-------|
| **Trigger** | Action item status → `completed` |
| **Fired by** | Assignee |
| **Recipient** | Meeting organizer |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Action Item Completed: {actionRef}` |
| **Body** | `{assigneeName} has completed action item {actionRef} from meeting "{meetingTitle}" on project {projectName}.` |

---

## 11 · Punch List Items

### 11.1 — Punch Item Assigned

| Field | Value |
|-------|-------|
| **Trigger** | Punch item created with `assigned_to` |
| **Fired by** | QC Inspector / PM |
| **Recipient** | Assignee |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Punch Item Assigned: {punchRef}` |
| **Body** | `You have been assigned a punch list item on project {projectName}. {punchRef}: {description}. Due: {dueDate}. Category: {category}.` |

**Escalation:**

| Days past due | Priority |
|---|---|
| 1 day | `high` |
| 3 days | `urgent` + PM notified |
| 7 days | `critical` + PM + Project Director |

---

### 11.2 — Punch Item Ready for Inspection

| Field | Value |
|-------|-------|
| **Trigger** | Punch item status → `ready_for_inspection` |
| **Fired by** | Assignee |
| **Recipient** | QC Inspector |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Punch Item Ready: {punchRef}` |
| **Body** | `{assigneeName} has marked punch item {punchRef} as ready for inspection on project {projectName}. Please verify.` |

---

### 11.3 — Punch Item Closed

| Field | Value |
|-------|-------|
| **Trigger** | Punch item status → `closed` |
| **Fired by** | QC Inspector |
| **Recipient** | PM + Assignee |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Punch Item Closed: {punchRef}` |
| **Body** | `Punch item {punchRef} has been verified and closed by {fromName} on project {projectName}.` |

---

## 12 · Interface Management

### 12.1 — Interface Action Assigned

| Field | Value |
|-------|-------|
| **Trigger** | Interface action item created with responsible party |
| **Fired by** | Interface Manager |
| **Recipient** | Responsible person |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Interface Action Required: {interfaceRef}` |
| **Body** | `You are responsible for an interface action on project {projectName}. Interface: {interfaceRef} — {description}. Required by: {requiredDate}.` |

**Escalation:**

| Days past required date | Priority | Action |
|---|---|---|
| 1 day | `high` | Reminder |
| 5 days | `urgent` | + PM notified |
| 10 days | `critical` | + Interface Manager + Project Director |

---

### 12.2 — Interface Action Resolved

| Field | Value |
|-------|-------|
| **Trigger** | Interface action status → `closed` |
| **Fired by** | Responsible person |
| **Recipient** | Interface Manager + PM |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Interface Closed: {interfaceRef}` |
| **Body** | `Interface action {interfaceRef} on project {projectName} has been resolved by {fromName}.` |

---

## 13 · Risk Register

### 13.1 — High-Risk Item Added

| Field | Value |
|-------|-------|
| **Trigger** | Risk item created with impact × probability score ≥ threshold (e.g. HIGH or CRITICAL) |
| **Fired by** | Risk Owner / PM |
| **Recipient** | PM + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `High Risk Identified: {riskRef}` |
| **Body** | `A high-severity risk has been logged on project {projectName}. Risk: {description}. Impact: {impact}. Probability: {probability}. Owner: {ownerName}.` |

---

### 13.2 — Risk Mitigation Due

| Field | Value |
|-------|-------|
| **Trigger** | Cron: risk mitigation target date reached and risk status still `open` |
| **Fired by** | System |
| **Recipient** | Risk Owner + PM |
| **Channel** | In-App + Email |
| **Priority** | `urgent` |
| **Title** | `Risk Mitigation Overdue: {riskRef}` |
| **Body** | `Mitigation action for risk {riskRef} on project {projectName} was due on {targetDate} and remains open.` |

---

### 13.3 — Risk Escalated (score increased)

| Field | Value |
|-------|-------|
| **Trigger** | Risk rating updated to CRITICAL or score increases |
| **Fired by** | Risk Owner |
| **Recipient** | PM + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `urgent` |
| **Title** | `Risk Escalated: {riskRef}` |
| **Body** | `Risk {riskRef} on project {projectName} has been escalated. New rating: {newRating}. Description: {description}.` |

---

## 14 · Handover Certificates

### 14.1 — Certificate Issued

| Field | Value |
|-------|-------|
| **Trigger** | Certificate status → `issued` |
| **Fired by** | PM / Admin |
| **Recipient** | Project Director + Client Rep (email) |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Handover Certificate Issued: {certNo}` |
| **Body** | `Handover Certificate {certNo} — "{title}" for area {areaZone} has been issued on project {projectName}. Handover Date: {handoverDate}.` |

---

### 14.2 — Certificate Acceptance Pending

| Field | Value |
|-------|-------|
| **Trigger** | Cron: certificate in `issued` / `pending_acceptance` for 7 days |
| **Fired by** | System |
| **Recipient** | PM + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Handover Pending Acceptance: {certNo}` |
| **Body** | `Handover Certificate {certNo} on project {projectName} has been awaiting client acceptance for {N} days.` |

---

### 14.3 — Certificate Accepted

| Field | Value |
|-------|-------|
| **Trigger** | Certificate status → `accepted` |
| **Fired by** | PM / Admin |
| **Recipient** | Finance Manager + PM + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Certificate Accepted: {certNo}` |
| **Body** | `Client has accepted Handover Certificate {certNo} on project {projectName}. DLP runs from {dlpStart} to {dlpEnd}.` |

---

### 14.4 — DLP Expiry Warning

| Field | Value |
|-------|-------|
| **Trigger** | Cron: 30 and 7 days before defect liability end date |
| **Fired by** | System |
| **Recipient** | PM + Project Director |
| **Channel** | In-App + Email |
| **Priority** | 30 days = `normal` · 7 days = `urgent` |
| **Title** | `DLP Expiring in {N} Days: {certNo}` |
| **Body** | `Defect Liability Period for Certificate {certNo} on project {projectName} expires on {dlpEnd}. Ensure all defects are resolved.` |

---

## 15 · Equipment / Rental

### 15.1 — Maintenance Alert Due

| Field | Value |
|-------|-------|
| **Trigger** | Cron: equipment maintenance schedule date reached |
| **Fired by** | System |
| **Recipient** | Maintenance Manager + Equipment Owner |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Maintenance Due: {assetCode}` |
| **Body** | `Scheduled maintenance for {assetName} ({assetCode}) is due on {dueDate}. Type: {maintenanceType}.` |

**Escalation:**

| Days overdue | Priority |
|---|---|
| 2 days | `urgent` |
| 7 days | `critical` + Fleet Manager |

---

### 15.2 — Rental Contract Expiry

| Field | Value |
|-------|-------|
| **Trigger** | Cron: 14 and 3 days before rental contract end date |
| **Fired by** | System |
| **Recipient** | Rental Manager + Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | 14 days = `normal` · 3 days = `urgent` |
| **Title** | `Rental Contract Expiring: {contractRef}` |
| **Body** | `Rental contract {contractRef} for {assetName} expires on {endDate}. Please arrange extension or return.` |

---

### 15.3 — Equipment Return Overdue

| Field | Value |
|-------|-------|
| **Trigger** | Cron: rental contract end date passed and status ≠ `closed` |
| **Fired by** | System |
| **Recipient** | Rental Manager + PM (if project-linked) |
| **Channel** | In-App + Email |
| **Priority** | `urgent` |
| **Title** | `Equipment Return Overdue: {contractRef}` |
| **Body** | `Equipment {assetName} under contract {contractRef} was due for return on {endDate} and has not been returned.` |

---

## 16 · Leave Requests (HR)

### 16.1 — Leave Request Submitted

| Field | Value |
|-------|-------|
| **Trigger** | Leave request created |
| **Fired by** | Employee |
| **Recipient** | Direct Manager + HR Manager |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Leave Request: {employeeName}` |
| **Body** | `{employeeName} has requested {leaveType} leave from {startDate} to {endDate} ({days} days). Reason: {reason}.` |

**Escalation:** 2 business days without decision → `high` reminder to manager.

---

### 16.2 — Leave Approved / Rejected

| Field | Value |
|-------|-------|
| **Trigger** | Leave request status → `approved` or `rejected` |
| **Fired by** | Manager / HR |
| **Recipient** | Employee |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Leave {Approved/Rejected}: {leaveType} {startDate}–{endDate}` |
| **Body** | `Your leave request from {startDate} to {endDate} has been {approved/rejected} by {approverName}. {rejectionReason if rejected}` |

---

### 16.3 — Leave Balance Low

| Field | Value |
|-------|-------|
| **Trigger** | Cron: employee's annual leave balance < 5 days at start of month |
| **Fired by** | System |
| **Recipient** | Employee + HR Manager |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `Low Leave Balance: {employeeName}` |
| **Body** | `{employeeName} has {balance} annual leave days remaining for the year.` |

---

## 17 · Payroll

### 17.1 — Payroll Run Ready for Review

| Field | Value |
|-------|-------|
| **Trigger** | Payroll run status → `draft` (created) |
| **Fired by** | System / Payroll Officer |
| **Recipient** | Payroll Manager + Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Payroll Ready for Review: {period}` |
| **Body** | `Payroll run for {period} has been prepared and is ready for review. Total net: {totalNet} {currency}. {employeeCount} employees.` |

---

### 17.2 — Payroll Approved

| Field | Value |
|-------|-------|
| **Trigger** | Payroll run status → `approved` |
| **Fired by** | Finance Manager |
| **Recipient** | Payroll Officer + GM/Director |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Payroll Approved: {period}` |
| **Body** | `Payroll for {period} has been approved by {approverName}. Ready for payment processing. Total: {totalNet} {currency}.` |

---

### 17.3 — Payslip Published

| Field | Value |
|-------|-------|
| **Trigger** | Payroll run status → `paid` / payslips published |
| **Fired by** | System |
| **Recipient** | Every employee in the payroll run |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Your Payslip is Ready — {period}` |
| **Body** | `Your payslip for {period} is available. Net pay: {netPay} {currency}. Log in to view the full breakdown.` |

---

### 17.4 — Contract Expiry (Employment)

| Field | Value |
|-------|-------|
| **Trigger** | Cron: employee contract end date in 60, 30, 7 days |
| **Fired by** | System |
| **Recipient** | HR Manager + Direct Manager |
| **Channel** | In-App + Email |
| **Priority** | 60 days = `normal` · 30 days = `high` · 7 days = `urgent` |
| **Title** | `Employee Contract Expiring: {employeeName} in {N} days` |
| **Body** | `{employeeName}'s employment contract expires on {endDate}. Please initiate renewal or termination process.` |

---

## 18 · Manufacturing Orders

### 18.1 — Manufacturing Request Approved

| Field | Value |
|-------|-------|
| **Trigger** | Manufacturing request status → `approved` |
| **Fired by** | Production Manager |
| **Recipient** | Requestor |
| **Channel** | In-App |
| **Priority** | `normal` |
| **Title** | `MFG Request Approved: {moRef}` |
| **Body** | `Your manufacturing request {moRef} has been approved. A production order will be scheduled.` |

---

### 18.2 — Manufacturing Order Due Soon

| Field | Value |
|-------|-------|
| **Trigger** | Cron: MO scheduled end date within 2 days and status not `completed` |
| **Fired by** | System |
| **Recipient** | Production Manager + Scheduler |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `MO Due in 2 Days: {moRef}` |
| **Body** | `Manufacturing order {moRef} for {productName} is due on {scheduledEnd}. Current progress: {progress}%.` |

---

### 18.3 — MO Completed

| Field | Value |
|-------|-------|
| **Trigger** | MO status → `done` |
| **Fired by** | Production Operator |
| **Recipient** | Production Manager + Requestor |
| **Channel** | In-App |
| **Priority** | `low` |
| **Title** | `MO Completed: {moRef}` |
| **Body** | `Manufacturing order {moRef} for {productName} × {qty} has been completed by {fromName}.` |

---

## 19 · Intercompany Transfers

### 19.1 — Transfer Approval Required

| Field | Value |
|-------|-------|
| **Trigger** | Interco transfer status → `pending_approval` |
| **Fired by** | Initiating company Finance |
| **Recipient** | Receiving company Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Interco Transfer Approval: {transferRef}` |
| **Body** | `{fromCompany} has submitted an intercompany transfer to {toCompany} for {amount} {currency}. Reference: {transferRef}. Please review and approve.` |

---

### 19.2 — Transfer Approved / Rejected

| Field | Value |
|-------|-------|
| **Trigger** | Interco transfer status → `approved` or `rejected` |
| **Fired by** | Approver |
| **Recipient** | Initiating company Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `normal` |
| **Title** | `Interco Transfer {Approved/Rejected}: {transferRef}` |
| **Body** | `Transfer {transferRef} has been {approved/rejected} by {approverName} at {toCompany}.` |

---

## 20 · FX Rate Alerts

### 20.1 — FX Rate Stale

| Field | Value |
|-------|-------|
| **Trigger** | Cron: currency pair rate not updated in > 1 business day |
| **Fired by** | System (fx-sync worker) |
| **Recipient** | Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Stale FX Rate: {baseCurrency}/{quoteCurrency}` |
| **Body** | `The FX rate for {baseCurrency}/{quoteCurrency} has not been updated since {lastUpdated}. Please update manually or check the CBI feed.` |

---

### 20.2 — FX Rate Threshold Breach

| Field | Value |
|-------|-------|
| **Trigger** | Rate moves beyond configured % threshold vs. previous |
| **Fired by** | System |
| **Recipient** | Finance Manager + CFO |
| **Channel** | In-App + Email |
| **Priority** | `urgent` |
| **Title** | `FX Rate Movement Alert: {pair}` |
| **Body** | `{baseCurrency}/{quoteCurrency} has moved {changePercent}% since yesterday (from {oldRate} to {newRate}). Threshold: {thresholdPercent}%.` |

---

## 21 · Budget Alerts (Projects)

### 21.1 — Budget Consumed 80%

| Field | Value |
|-------|-------|
| **Trigger** | Committed + actual spend reaches 80% of budget for a cost code |
| **Fired by** | System (on PO/invoice posting) |
| **Recipient** | PM + Finance Manager |
| **Channel** | In-App + Email |
| **Priority** | `high` |
| **Title** | `Budget 80%: {costCode} — {projectName}` |
| **Body** | `Cost code {costCode} on project {projectName} has reached 80% of budget. Spent: {spent} / {budget} {currency}.` |

---

### 21.2 — Budget Exceeded

| Field | Value |
|-------|-------|
| **Trigger** | Committed + actual spend exceeds 100% of budget |
| **Fired by** | System |
| **Recipient** | PM + Finance Manager + Project Director |
| **Channel** | In-App + Email |
| **Priority** | `critical` |
| **Title** | `Budget Exceeded: {costCode} — {projectName}` |
| **Body** | `Cost code {costCode} on project {projectName} has exceeded its budget. Overspend: {overspend} {currency} ({overPercent}% over).` |

---

## 22 · System / Admin

### 22.1 — New User Invited

| Field | Value |
|-------|-------|
| **Trigger** | User invitation created |
| **Fired by** | Admin |
| **Recipient** | Invited user (email only) |
| **Channel** | Email |
| **Priority** | `normal` |
| **Title** | `You've Been Invited to FNC ERP` |
| **Body** | `{adminName} has invited you to join {companyName} on FNC ERP. Click below to set your password and get started.` |

---

### 22.2 — Outbox / Worker Failure

| Field | Value |
|-------|-------|
| **Trigger** | Event moved to DLQ (failed after all retries) |
| **Fired by** | System |
| **Recipient** | System Admin |
| **Channel** | In-App + Email |
| **Priority** | `critical` |
| **Title** | `Worker Failure: {eventType}` |
| **Body** | `Event {eventId} of type {eventType} has been moved to the dead-letter queue after {maxRetries} retries. Last error: {lastError}.` |

---

### 22.3 — Backup / Snapshot Success or Failure

| Field | Value |
|-------|-------|
| **Trigger** | Daily backup cron completes |
| **Fired by** | System |
| **Recipient** | System Admin |
| **Channel** | Email only |
| **Priority** | `low` (success) · `critical` (failure) |
| **Title** | `Backup {Succeeded/Failed}: {timestamp}` |
| **Body** | `Daily database backup {succeeded/failed} at {timestamp}. {errorDetail if failed}` |

---

## Notification Priority → Visual Treatment

| Priority | In-App dot | Email prefix | Email CTA color |
|---|---|---|---|
| `low` | Grey `#9ca3af` | — | `#1a3c5e` |
| `normal` | Blue `#3b82f6` | Action Required | `#1a3c5e` |
| `high` | Amber `#f59e0b` | Action Required | `#1a3c5e` |
| `urgent` | Orange `#f97316` | 🚨 URGENT | `#f97316` |
| `critical` | Red `#dc2626` | 🔴 CRITICAL | `#dc2626` |

---

## Escalation General Rules

1. Escalation reminders are stored in a dedicated reminders table (`eng_doc_review_reminders` pattern — extend per module as needed).
2. The cron worker (`services/worker`) checks every 2 hours.
3. When a task is completed, its reminders row is resolved immediately (`resolved_at = NOW()`).
4. PM escalation fires at `reminder_count >= 3` by default; can be configured per module.
5. Notifications are never duplicated within the same escalation window — `last_reminded_at` guards this.

---

## Implementation Status

| Module | In-App | Email | Escalation |
|---|---|---|---|
| Engineering Documents | ✅ | ✅ | ✅ |
| Technical Queries | 🔲 | 🔲 | 🔲 |
| Contractor Deviation Requests | 🔲 | 🔲 | 🔲 |
| Variation Orders | 🔲 | 🔲 | 🔲 |
| Purchase Orders | 🔲 | 🔲 | 🔲 |
| RFQ | 🔲 | 🔲 | 🔲 |
| Subcontracts | 🔲 | 🔲 | 🔲 |
| Client Invoices | 🔲 | 🔲 | 🔲 |
| Vendor Invoices (AP) | 🔲 | 🔲 | 🔲 |
| Meetings & Actions | 🔲 | 🔲 | 🔲 |
| Punch List | 🔲 | 🔲 | 🔲 |
| Interface Management | 🔲 | 🔲 | 🔲 |
| Risk Register | 🔲 | 🔲 | 🔲 |
| Handover Certificates | 🔲 | 🔲 | 🔲 |
| Equipment / Rental | 🔲 | 🔲 | 🔲 |
| Leave Requests | 🔲 | 🔲 | 🔲 |
| Payroll | 🔲 | 🔲 | 🔲 |
| Manufacturing | 🔲 | 🔲 | 🔲 |
| Interco Transfers | 🔲 | 🔲 | 🔲 |
| FX Rate Alerts | 🔲 | 🔲 | 🔲 |
| Budget Alerts | 🔲 | 🔲 | 🔲 |
| System / Admin | 🔲 | 🔲 | — |
