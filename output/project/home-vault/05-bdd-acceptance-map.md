# BDD acceptance map

> Status: Draft for client approval  
> Version: 0.1  
> Prepared: 15 July 2026  
> Product name: Home Vault (working title)

The full machine-readable Given/When/Then content is maintained in `../../spec/home-vault/home-vault-features-requirements-bdd.json`. This file provides the review map.

| Feature | Requirement | Scenario | Title |
| --- | --- | --- | --- |
| F-01 | REQ-01.1 | BDD-01.1-A | Visitor understands the proposition and starts registration |
| F-01 | REQ-01.2 | BDD-01.2-A | Registered customer recovers account access |
| F-01 | REQ-01.3 | BDD-01.3-A | Customer updates profile details |
| F-02 | REQ-02.1 | BDD-02.1-A | Free customer builds one useful property record |
| F-02 | REQ-02.2 | BDD-02.2-A | Paid customer receives active management tools |
| F-02 | REQ-02.3 | BDD-02.3-A | Customer chooses an approved billing period |
| F-03 | REQ-03.1 | BDD-03.1-A | Customer adds a property within the plan limit |
| F-03 | REQ-03.2 | BDD-03.2-A | Customer classifies a new property |
| F-03 | REQ-03.3 | BDD-03.3-A | Property lookup fails without blocking setup |
| F-03 | REQ-03.4 | BDD-03.4-A | Customer tailors the room list |
| F-04 | REQ-04.1 | BDD-04.1-A | Customer uploads room photos from a mobile browser |
| F-04 | REQ-04.2 | BDD-04.2-A | Customer retrieves a saved paint reference |
| F-04 | REQ-04.3 | BDD-04.3-A | Customer creates a before-and-after view |
| F-04 | REQ-04.4 | BDD-04.4-A | Social share excludes private information |
| F-05 | REQ-05.1 | BDD-05.1-A | Customer records a room asset |
| F-05 | REQ-05.2 | BDD-05.2-A | Customer finds an asset warranty document |
| F-05 | REQ-05.3 | BDD-05.3-A | Warranty date creates a reminder |
| F-05 | REQ-05.4 | BDD-05.4-A | Customer prepares asset information for an accountant |
| F-06 | REQ-06.1 | BDD-06.1-A | Customer creates a room maintenance task |
| F-06 | REQ-06.2 | BDD-06.2-A | Recurring task advances after completion |
| F-06 | REQ-06.3 | BDD-06.3-A | Customer filters work to one property |
| F-06 | REQ-06.4 | BDD-06.4-A | Customer receives a due-date email reminder |
| F-07 | REQ-07.1 | BDD-07.1-A | Customer records different financial types |
| F-07 | REQ-07.2 | BDD-07.2-A | Customer uploads a room renovation invoice |
| F-07 | REQ-07.3 | BDD-07.3-A | Customer categorises a utility bill |
| F-07 | REQ-07.4 | BDD-07.4-A | Customer reviews twelve months of electricity cost |
| F-08 | REQ-08.1 | BDD-08.1-A | Customer moves from property to room reporting |
| F-08 | REQ-08.2 | BDD-08.2-A | Customer generates a property information report |
| F-08 | REQ-08.3 | BDD-08.3-A | Accountant export reconciles to recorded spend |
| F-09 | REQ-09.1 | BDD-09.1-A | Owner invites a read-only collaborator |
| F-09 | REQ-09.2 | BDD-09.2-A | Administrator cannot transfer ownership |
| F-09 | REQ-09.3 | BDD-09.3-A | Collaborator adds a room comment |
| F-10 | REQ-10.1 | BDD-10.1-A | Display preference persists |
| F-10 | REQ-10.2 | BDD-10.2-A | Customer pauses reminder emails but retains tasks |
| F-11 | REQ-11.1 | BDD-11.1-A | Seller creates a passport preview |
| F-11 | REQ-11.2 | BDD-11.2-A | Buyer-safe output protects seller economics |
| F-11 | REQ-11.3 | BDD-11.3-A | New owner claims a transferred property |
| F-11 | REQ-11.4 | BDD-11.4-A | Transfer requires informed confirmation |
| F-12 | REQ-12.1 | BDD-12.1-A | Barcode lookup remains editable |
| F-12 | REQ-12.2 | BDD-12.2-A | Image analysis never silently overwrites customer data |
| F-12 | REQ-12.3 | BDD-12.3-A | Customer controls a suggested maintenance task |
| F-12 | REQ-12.4 | BDD-12.4-A | Commercial referral is transparent |

## Acceptance convention

- Every requirement has at least one BDD scenario.
- Permission, privacy, tier-boundary and failure behaviour should receive additional scenarios during detailed design.
- BDD scenarios must remain traceable to a stable requirement ID.
- A scenario is not complete until its expected evidence is automated or explicitly assigned to manual verification.
