# Feature requirements

> Status: Draft for client approval  
> Version: 0.1  
> Prepared: 15 July 2026  
> Product name: Home Vault (working title)

| ID | Feature | Phase | Access |
| --- | --- | --- | --- |
| F-01 | Public website, account access and profile | MVP | Public and all registered users |
| F-02 | Plans, subscription and access | MVP | Free and paid customers |
| F-03 | Property portfolio and setup | MVP | Free for one property; paid for multiple properties |
| F-04 | Rooms and visual home record | MVP with post-MVP sharing | All registered users within plan limits |
| F-05 | Assets, invoices, warranties and trade records | MVP | Paid customers and authorised collaborators |
| F-06 | Tasks, reminders and calendar | MVP | Paid customers and authorised administrators |
| F-07 | Costs, expenses and renovation budgets | MVP | Paid customers and authorised administrators |
| F-08 | Property reporting and exports | MVP with future sale report | Paid customers and permitted collaborators |
| F-09 | Users, permissions and collaboration | MVP | Paid owners and invited users |
| F-10 | Preferences and display | MVP | All registered users |
| F-11 | Property Passport and ownership transfer | Future | Future paid add-on or approved entitlement |
| F-12 | Smart capture and proactive guidance | Future | To be confirmed |

## F-01 - Public website, account access and profile

**Phase:** MVP  
**Access:** Public and all registered users  
**Workshop trace:** 19:49-20:09, 32:52-34:11, 36:01-37:26

Explain the proposition, convert visitors to a free account and provide secure access to a personal profile.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-01.1 | Must | MVP | The public website shall explain the one-place property record proposition, the free one-property offer and the additional value of the paid plan, with a clear registration call to action. |
| REQ-01.2 | Must | MVP | The service shall support account registration, sign-in, sign-out and password recovery using an email address. |
| REQ-01.3 | Should | MVP | A registered customer shall be able to maintain a personal profile, including display name and profile photo. |

## F-02 - Plans, subscription and access

**Phase:** MVP  
**Access:** Free and paid customers  
**Workshop trace:** 7:00-10:40, 12:00-13:48, 29:33-33:52

Provide a genuinely useful free record and a clear paid path for active property management.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-02.1 | Must | MVP | The free plan shall allow one property and its rooms to retain core information, photos, paint details and documents. |
| REQ-02.2 | Must | MVP | The paid plan shall unlock additional properties and active tools including assets, automated or recurring tasks, reminders, calendars, financial tracking and reporting. |
| REQ-02.3 | Should | MVP | The launch checkout shall support the approved pricing options; the workshop hypothesis is NZD 19 per month or NZD 199 per year, subject to client and market validation. |

## F-03 - Property portfolio and setup

**Phase:** MVP  
**Access:** Free for one property; paid for multiple properties  
**Workshop trace:** 3:12-6:18, 19:49-21:35, 29:33-33:52

Create and manage structured property records without requiring specialist property-management knowledge.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-03.1 | Must | MVP | A customer shall be able to add, view, edit and archive a property record, subject to the customer's plan limit. |
| REQ-03.2 | Must | MVP | The property setup shall capture the address and owner-selected property context, including whether the property is the customer's home or a rental/investment property. |
| REQ-03.3 | Should | MVP subject to integration feasibility | Where a lawful and commercially available property-data source is approved, the setup shall pre-populate available property information and allow the customer to confirm or correct it; manual entry shall always remain available. |
| REQ-03.4 | Must | MVP | New properties shall offer a practical default set of rooms, and authorised customers shall be able to add, rename, reorder and remove rooms. |

## F-04 - Rooms and visual home record

**Phase:** MVP with post-MVP sharing  
**Access:** All registered users within plan limits  
**Workshop trace:** 22:05-26:26, 32:52-35:01, 36:01-37:26

Make each room an engaging, image-rich record of finishes, history and related property information.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-04.1 | Must | MVP | An authorised customer shall be able to upload and organise multiple photos against a room. |
| REQ-04.2 | Must | MVP | A room record shall support practical finish information, including wall or surface paint colour, brand or reference details and free-text notes. |
| REQ-04.3 | Should | MVP | Room photos shall be capable of being labelled or ordered to show before-and-after renovation states. |
| REQ-04.4 | Could | Post-MVP | A customer should be able to create a privacy-checked social-ready before-and-after image or link without exposing private property or financial information. |

## F-05 - Assets, invoices, warranties and trade records

**Phase:** MVP  
**Access:** Paid customers and authorised collaborators  
**Workshop trace:** 4:34-5:14, 10:43-11:51, 23:40-26:26

Retain the evidence and dates needed to own, maintain and report on items within a property.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-05.1 | Must | MVP | An authorised paid user shall be able to create an asset at property or room level with description, product details, purchase date and optional supplier or trade contact. |
| REQ-05.2 | Must | MVP | An asset shall support attached invoices, receipts, warranty documents and relevant photos. |
| REQ-05.3 | Must | MVP | An asset shall support warranty expiry, recommended service date and service history information that can create related reminders or tasks. |
| REQ-05.4 | Should | MVP | The service shall maintain an asset register with purchase-value and depreciation-input fields suitable for review or export to an accountant; the service shall not present itself as tax advice. |

## F-06 - Tasks, reminders and calendar

**Phase:** MVP  
**Access:** Paid customers and authorised administrators  
**Workshop trace:** 10:58-11:56, 21:35-23:21, 29:33-33:52, 35:29-35:59

Make maintenance and renovation work visible, repeatable and less likely to be missed.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-06.1 | Must | MVP | An authorised paid user shall be able to create a dated task against a property, room or asset and assign notes and status. |
| REQ-06.2 | Must | MVP | A task or reminder shall support recurrence, including monthly and annual patterns, and shall create the next occurrence without duplicating completed history. |
| REQ-06.3 | Must | MVP | Paid customers shall be able to review work in calendar and Kanban-style task views, with filters for portfolio, property, room, asset, status and date. |
| REQ-06.4 | Must | MVP | The service shall send scheduled email reminders for enabled due dates, including examples such as heat-pump servicing, filter or UV-lamp replacement and smoke-alarm testing. |

## F-07 - Costs, expenses and renovation budgets

**Phase:** MVP  
**Access:** Paid customers and authorised administrators  
**Workshop trace:** 23:49-25:11, 28:18-29:18, 31:34-32:52

Provide a consistent financial record for assets, renovations and ongoing property ownership.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-07.1 | Must | MVP | The service shall distinguish asset purchases, renovation costs and ongoing property expenses as separate financial record types. |
| REQ-07.2 | Must | MVP | A financial record shall be assignable to a property and, where relevant, a room, with amount, date, category, notes and supporting bill, receipt or invoice. |
| REQ-07.3 | Must | MVP | Ongoing expense categories shall include, at minimum, electricity, gas, rates, cleaning and maintenance, with customer-defined categories available where required. |
| REQ-07.4 | Should | MVP | The service shall support renovation budgets and actual-cost comparison, plus period views that can show at least twelve months of household operating expenses by property and category. |

## F-08 - Property reporting and exports

**Phase:** MVP with future sale report  
**Access:** Paid customers and permitted collaborators  
**Workshop trace:** 24:39-26:59, 29:33-33:52, 36:01-37:26

Turn the retained information into useful owner, renovation and accountant views.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-08.1 | Must | MVP | Paid customers shall be able to review assets, tasks, costs, expenses and relevant documents at portfolio, property and room scope. |
| REQ-08.2 | Must | MVP | The service shall generate a client-approved Property Information Report containing the selected property's room photos, finish information, assets, warranties, maintenance and permitted supporting records. |
| REQ-08.3 | Should | MVP | The service shall provide downloadable accountant-focused exports for asset/depreciation inputs and property or room spend, with clear date and category fields. |

## F-09 - Users, permissions and collaboration

**Phase:** MVP  
**Access:** Paid owners and invited users  
**Workshop trace:** 29:18-29:33, 32:52-34:22, 37:26-38:20

Allow trusted people to participate without weakening the owner's control or confidentiality.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-09.1 | Must | MVP | A paid owner shall be able to invite another user and assign administrator or read-only access. |
| REQ-09.2 | Must | MVP | Only an owner or authorised administrator shall be able to change shared property information, and only the owner shall be able to manage ownership, subscription and transfer settings. |
| REQ-09.3 | Should | MVP | Authorised users shall be able to add and review timestamped comments or notes at property and room level. |

## F-10 - Preferences and display

**Phase:** MVP  
**Access:** All registered users  
**Workshop trace:** 32:52-34:11

Give each customer a comfortable and consistent personal experience.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-10.1 | Should | MVP | A registered customer shall be able to select light or dark display mode, and the preference shall persist across sessions on supported devices. |
| REQ-10.2 | Should | MVP | A customer shall be able to manage email-reminder preferences without deleting the underlying tasks or dates. |

## F-11 - Property Passport and ownership transfer

**Phase:** Future  
**Access:** Future paid add-on or approved entitlement  
**Workshop trace:** 25:11-29:21

Support a sale-time information product and controlled handover to the new owner.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-11.1 | Could | Future | A seller shall be able to generate a separately chargeable buyer-safe Property Passport for an eligible property. |
| REQ-11.2 | Must for future release | Future | The transferable record shall include approved room, asset, warranty and maintenance information but exclude seller-only renovation labour, material costs, margin and other confidential financial records. |
| REQ-11.3 | Must for future release | Future | Following an authorised property sale, the seller shall be able to initiate transfer and the new owner shall be able to claim the approved transferable record. |
| REQ-11.4 | Must for future release | Future | The service shall present the seller with an explicit inclusion and exclusion summary before any passport is shared or ownership is transferred. |

## F-12 - Smart capture and proactive guidance

**Phase:** Future  
**Access:** To be confirmed  
**Workshop trace:** 10:43-11:10, 21:35-22:05, 23:40-24:24, 32:36-35:59

Reduce manual data entry and help owners identify useful maintenance or improvement actions.

| Requirement | Priority | Phase | Statement |
| --- | --- | --- | --- |
| REQ-12.1 | Could | Future | The service may support barcode or QR-code capture to look up product details from an approved data source, while allowing customer correction and manual entry. |
| REQ-12.2 | Could | Future | The service may analyse an uploaded image to propose metadata such as a paint colour or product reference, subject to customer confirmation. |
| REQ-12.3 | Could | Future | The service may provide configurable maintenance prompts for common property needs, including heat-pump servicing, filter and UV-lamp replacement, smoke-alarm testing, annual checks and relevant council changes. |
| REQ-12.4 | Could | Future | The service may offer contextual improvement insights and approved supplier referrals, such as a solar opportunity based on recorded energy costs, with commercial relationships disclosed. |

