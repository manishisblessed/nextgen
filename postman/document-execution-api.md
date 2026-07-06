# Document Execution API

> Welcome to the Leegality Document Execution API documentation. This API lets you integrate Document Execution into your application. Use it to create signing requests, track document status, and retrieve signed documents and audit trails.

Welcome to the Leegality Document Execution API documentation. This API lets you integrate Document Execution into your application. Use it to create signing requests, track document status, and retrieve signed documents and audit trails.

## What can you do with this API?

- **Create eSigning requests** — Send documents for signing via based on pre-configured workflow.
- **Track status** — Check the entire document status or specific invitee details.
- **Retrieve signed documents** — Download the signed PDF and audit trail once all invitees have signed.
- **Real-time updates** — Use Webhooks to receive real-time notifications on signing events.

## Environments

| Environment | Dashboard | Base URL |
|---|---|---|
| Sandbox | https://sandbox-dashboard.leegality.com | `https://sandbox.leegality.com/api/` |
| Production | https://dashboard.leegality.com | `https://app1.leegality.com/api/` |

## Testing with Postman

A Postman Collection is available with pre-configured requests for common scenarios: [Download Postman Collection](https://drive.google.com/file/d/1EpJItMuIQPMFKgtmjHmjs7JKGqs3I4Dl/view)

Import the collection into Postman and add your Auth Token to begin testing.

## Need Help?

Reach out to [support@leegality.com](mailto:support@leegality.com) for any questions about your integration. You can also review our [Terms of Service](https://leegality.com/tnc).

        <table>
          <tbody>
            <tr>
              <th>
                Security Scheme Type:
              </th><td>
                apiKey
              </td>
            </tr><tr>
              <th>
                Header parameter name:
              </th><td>
                X-Auth-Token
              </td>
            </tr>
          </tbody>
        </table>