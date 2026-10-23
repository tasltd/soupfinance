# SOUPFIN-179 Payment Receipt — Backend Plan (soupmarkets-web)

Tracked as SOUPFIN-266 (child of SOUPFIN-179).

## Context

SoupFinance now lets a user attach a receipt (PDF, PNG or JPG, up to 5 MB) when recording an
outgoing payment. `PaymentFormPage` sends it in the JSON body of
`POST /rest/billPayment/save.json` as `paymentReceipt: "data:<mime>;base64,<payload>"`, as
`.claude/rules/soupfinance-api-json.md` requires. The payment detail page downloads it through
`GET /rest/soupBrokerFile/link/{paymentReceipt.id}`.

`BillPayment.paymentReceipt` is a `SoupBrokerFile`. `InvoicePayment` has no file field, so
incoming payments carry no receipt. That is a product decision, not part of this plan.

The backend does not store the file today. Probed on the soupfinance-backend LXC on
2026-10-13 as `david.tetteh` (ROLE_ADMIN), with nested `bill` / `payOutAccount` FKs:

| Request body | Result |
|---|---|
| `paymentReceipt: "<plain base64>"` | 422 `Property paymentReceipt is type-mismatched` |
| `paymentReceipt: "data:application/pdf;base64,<payload>"` | 422 `Property paymentReceipt is type-mismatched` |
| `paymentReceiptFile: "<plain base64>"` | 201, payment saved, file silently dropped |
| multipart `paymentReceiptFile=@file.pdf` | payment saved, file silently dropped |

## Root causes

### 1. `CachedRequestUtilityFilterInterceptor` reads the wrong path segment

`grails-app/controllers/soupbroker/CachedRequestUtilityFilterInterceptor.groovy`, `doFilter`:

```groovy
String[] parts = path.split("/")
String controller = parts.length > 1 ? parts[1] : null   // "rest" for /rest/billPayment/save.json
bodyJson.controller = controller
soupBrokerFileUtilityService.loadFileFromRequest(bodyJson)
```

For every `/rest/*` URL `parts[1]` is `"rest"`, so `loadFileFromRequest` finds no domain
class and does nothing. The base64 string reaches data binding unchanged and fails as a
type mismatch. Module-prefixed URLs (`/rest/finance/bill/...`) are off by two segments. The
JSON path only ever worked for un-prefixed URLs such as `/account/update/{id}.json`.

### 2. A `data:` URI is never recognised or decoded

`SoupBrokerFileUtilityService.loadFileFromRequest` tests the value with
`org.apache.commons.codec.binary.Base64.isBase64(String)`, which returns false for `:`, `;`
and `,`. `loadFile(domainObject, property, String)` then calls `decodeBase64()` on the whole
string. A data URI is therefore either skipped or, if it got through, decoded with its
prefix and stored corrupt. The frontend already sends data URIs for the account logo and
favicon (SOUPFIN-16), so this affects more than receipts.

### 3. Tenant context is often missing in the filter (check while fixing 1)

The filter runs as a Servlet `@Order(1)` filter, before `ApiAuthenticatorInterceptor` sets
`session.tenantId`. With `X-Auth-Token` auth the session has no tenant, and strategy 3
looks the ApiConsumer up with an MD5 of the secret, while the LXC compares the secret
directly. When no tenant is found the method logs "Skipping file processing in filter" and
returns. The comment says "the controller will handle file processing later", but nothing
does. The multipart path in `UploadFileInterceptor.before()` calls the same method and is
the likely reason the multipart probe also dropped the file.

## Required changes

### CachedRequestUtilityFilterInterceptor

- Resolve the controller from the URL the way `UrlMappings` does: skip a leading `rest`
  segment and an optional module segment (`trading`, `finance`, `funds`, `setting`, `tools`,
  `sales`, `kyc`, `clients`, `admin`, `staff`). Simplest correct version: take the first
  segment after those that matches a controller artefact
  (`grailsApplication.getArtefactByLogicalPropertyName("Controller", seg)`).

### SoupBrokerFileUtilityService

- Add `parseDataUri(String)` returning `[contentType, bytes]` for
  `^data:([\w.+-]+/[\w.+-]+)(;[^,]*)?;base64,(.+)$`.
- In `processFileField`, treat a data URI as base64. Pass its content type through to the
  created `SoupBrokerFile.contentType`, and give it `originalFileName` from an optional
  sibling `<property>FileName` when present.
- In `loadFile(..., String)`, strip a data-URI prefix before `decodeBase64()`.
- When the filter cannot resolve a tenant, do the file materialisation in the controller's
  save/update instead (or move it into an interceptor ordered after
  `ApiAuthenticatorInterceptor`), rather than skipping silently.

### Validation (recommended)

- Reject a `paymentReceipt` over 5 MB or outside `application/pdf`, `image/png`,
  `image/jpeg` with 422 and a field error, matching the frontend limits.

## API contract after the fix

```
POST /rest/billPayment/save.json?SYNCHRONIZER_TOKEN=..&SYNCHRONIZER_URI=..
Content-Type: application/json
{
  "bill": { "id": "<billId>" },
  "amount": 125.00,
  "paymentDate": "2026-10-13",
  "payOutAccount": { "id": "<ledgerAccountId>" },
  "paymentReceipt": "data:application/pdf;base64,JVBERi0xLjQK..."
}

201
{ "id": "...", ..., "paymentReceipt": { "id": "<fileId>", "class": "soupbroker.tools.SoupBrokerFile", "serialised": "..." } }

GET /rest/billPayment/show/{id}.json   -> same paymentReceipt reference
GET /rest/soupBrokerFile/link/{fileId} -> the original bytes, Content-Type application/pdf
```

## Acceptance test

`soupfinance-web/e2e/integration/soupfin-179-payment-receipt.integration.spec.ts` runs
this exact round trip against the LXC and compares the downloaded bytes with the bytes
sent. It fails today at the save (422) and should pass unchanged once this plan ships and
the WAR is deployed to the soupfinance-backend LXC (`assembleDeployToSoupfinanceBackend`).

## Related

- SOUPFIN-176: the payment form still sends dotted `'bill.id'` keys, which JSON binding
  ignores. Until it is fixed the form cannot save a bill payment at all, receipt or not.
