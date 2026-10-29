# MyIMO Pay API Integration Instructions

## 1. Staging Environment

Begin the integration using the MyIMO Pay staging environment.

**Staging API Documentation:**

[https://apipg.demo.myimopay.com/api-docs](https://apipg.demo.myimopay.com/api-docs?utm_source=chatgpt.com)

Use the staging API documentation as the primary reference for the available endpoints, request parameters, response structures, and integration requirements.

## 2. API Authentication

All API requests must include the merchant **Public Key** in the request header using the header name:

```http
xp-key: <Public Key>
```

Requests should also include the appropriate content type, where applicable:

```http
Content-Type: application/json
xp-key: <Public Key>
```

The `xp-key` header is required for **every API call** that requires merchant authentication. Do not omit it from individual requests.

The Public Key must be obtained from the merchant account and must not be hard-coded into source code or committed to source control.

## 3. Obtaining Staging API Keys

Create or use a staging merchant account through:

[MyIMO Pay Staging Merchant Account](https://app.demo.myimopay.com/login?utm_source=chatgpt.com)

After signing in to the staging merchant account:

1. Navigate to **Securities**.

2. Locate the available API keys.

3. Obtain the **Public Key** required for API requests.

4. Configure the key securely in the development/staging environment.

Do not place the Public Key directly in application source code, configuration files that are committed to source control, or client-side code where it can be unnecessarily exposed.

## 4. Live Environment

Do not begin live integration testing until the staging integration has been completed and verified.

Once staging integration is complete, configure the integration for the live environment using the following endpoints and merchant portal.

**Live API:**

[MyIMO Pay Live API](https://api.myimopay.com/?utm_source=chatgpt.com)

**Live Merchant Account:**

[MyIMO Pay Live Merchant Account](https://app.myimopay.com/?utm_source=chatgpt.com)

The live environment must use the appropriate live merchant credentials and Public Key. Do not use staging credentials against the live API, and do not use live credentials against the staging API.

The application must keep staging and live configuration separate so that changing environments does not require modifying application code.

## 5. Transaction Testing and Financial Warning

**Important: Transactions made through both the staging and live MyIMO Pay platforms involve actual money.**

Consequently, use **small transaction amounts when performing payment tests** and avoid unnecessary transactions or repeated payment attempts.

Before initiating a test transaction, verify the transaction amount, merchant account, transaction reference, and other relevant parameters.

Do not assume that a transaction made on the staging platform is a simulated or non-financial transaction. Treat all payment transactions as financially consequential unless MyIMO Pay explicitly confirms otherwise.

## 6. Government API Restriction

**Do NOT use the government API endpoints for development, testing, integration, or automated requests.**

The government API endpoints are intended for public use and are outside the scope of this integration.

All development and integration testing must be performed against the designated **staging API**. The **live API** should only be used once the integration has been completed and is ready for production use.

## 7. Implementation Requirements

The development team should implement the integration so that:

- The MyIMO Pay API base URL is configurable by environment.

- The `xp-key` Public Key is supplied through secure configuration.

- The `xp-key` header is included in every applicable API request.

- Staging and live credentials are kept completely separate.

- API request and response structures follow the current staging API documentation.

- Sensitive credentials are never committed to source control.

- Sensitive credentials are not written to application logs.

- Payment testing uses the smallest practical transaction amounts.

- Government API endpoints are not used under any circumstances for this integration.

- The integration is first verified against staging before being configured for live operation.

The staging API documentation should be treated as the authoritative technical reference for implementing the integration. Where the documentation and observed API behaviour differ, document the discrepancy and verify the expected behaviour before implementing a workaround.


