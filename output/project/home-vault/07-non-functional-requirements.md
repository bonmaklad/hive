# Non-functional requirements

> Status: Draft for client approval  
> Version: 0.1  
> Prepared: 15 July 2026  
> Product name: Home Vault (working title)

| ID | Category | Requirement | Evidence |
| --- | --- | --- | --- |
| NFR-01 | Privacy and legal readiness | Before public launch, the service shall have client-approved terms of use and privacy information that accurately describes data collection, use, storage, sharing and customer choices, supported by appropriate New Zealand legal review. | Approved terms of use<br>Approved privacy notice<br>Recorded consent/version<br>Launch legal-readiness sign-off |
| NFR-02 | Security and access control | Property, document and financial information shall be accessible only to authenticated and authorised users, with role and ownership rules enforced on the server side. | Authorisation test suite<br>Cross-account access tests<br>Role-permission tests<br>Security review before public launch |
| NFR-03 | Security assurance | The release process shall include security, penetration and data-access testing proportionate to the sensitivity and nationwide ambition of the service, with critical findings resolved before public launch. | Test scope<br>Findings register<br>Remediation evidence<br>Release sign-off |
| NFR-04 | Responsive experience | All MVP workflows shall operate in supported modern mobile and desktop browsers; a native mobile application is not required for the initial release. | Mobile browser test evidence<br>Desktop browser test evidence<br>Photo/document upload verification<br>No native-app dependency |
| NFR-05 | Usability and accessibility | The experience shall use clear language, visible status and accessible interaction patterns so customers can complete core flows without specialist property or accounting knowledge. | Usability review<br>Keyboard and focus review<br>Colour-contrast review<br>Client-approved terminology |
| NFR-06 | Document and image reliability | Uploads shall show status, reject unsupported or unsafe files clearly, preserve authorised access and prevent an apparent success when storage fails. | Success/failure upload tests<br>File-type and size tests<br>Authorised retrieval tests<br>Storage failure handling |
| NFR-07 | Reminder reliability | Scheduled reminder processing shall be observable and retryable, with send outcomes recorded so the service can identify failures without creating duplicate notices. | Scheduled-job test<br>Retry test<br>Duplicate-prevention test<br>Send-status evidence |
| NFR-08 | Performance and scale | The architecture shall support progressive growth from early customers to nationwide use without redesigning the core property-room-asset model; measurable performance targets shall be agreed before build completion. | Approved performance targets<br>Representative data-volume test<br>Load-test plan<br>Monitoring plan |
| NFR-09 | Data integrity and reporting | Reports and exports shall reconcile to source records, retain their scope and date context and apply permission and transfer-exclusion rules consistently. | Reconciliation tests<br>Permission tests<br>Transfer-exclusion tests<br>Export snapshot tests |
| NFR-10 | Customer trust | Automated or AI-assisted suggestions shall be distinguishable from customer-confirmed facts and shall not silently change property records or share customer information. | Confirmation tests<br>Suggestion-labelling review<br>Consent tests<br>Audit evidence |

## Solution assumptions

- The initial product is one responsive web application; there is no native mobile application in the initial scope.
- The experience will be image-rich and optimised for frequent mobile-browser capture.
- The workshop proposed Next.js for the web application and server-side functions, Supabase for the database and document storage, scheduled jobs for reminders and SendGrid for initial email delivery; final technology choices remain subject to technical validation.
- Homes.co.nz is an experience-category reference only and does not grant access to its data, branding, layouts or interfaces.
- Any third-party property or product lookup requires a lawful, approved and commercially viable data source.
- The final product name, logo, domain, colour palette and social handles remain client decisions.
- Delivery timing will be agreed after requirements approval and MVP sizing.
