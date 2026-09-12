# Indian bank catalogue

The versioned source is backend/data/indian-banks.json, seeded into bank_catalogue
at backend startup. Initial reference: https://www.rbi.org.in/scripts/banklinks.aspx
(reviewed 2026-09-10). Coverage: 80 domestic public/private, small finance, payments,
local area and regional rural banks. Cooperative banks require a separate verified
source; foreign banks are outside this initial domestic catalogue.

Maintenance: review the RBI directory and merger/licence notifications quarterly
and when a missing-bank request is received. Edit the JSON through a reviewed code
change, update its version, run tests, then restart/deploy the backend. This is a
manual maintenance process, not an automatic scheduled sync.

Keep IDs unchanged across spelling/name changes; update name and aliases.
Never remove IDs: set active=false for retired entries. Catalogue retirement hides
the bank from new selections and uploads, while retaining account and statement
history. Review mergers explicitly; do not automatically combine historical banks.
Add verified cooperative coverage as new entries using the same schema.

User removal is permitted only with zero attached statement records of any status.
Deactivation retains references and history; reactivation requires an active
catalogue entry. Catalogue access does not establish a live connection to a bank.

Statement uniqueness is per user/account/calendar month across PDF and XLSX.
Raw AI-extracted dates are checked before normalization can discard rows; draft
confirmation validates again. Invalid dates and any out-of-month date reject the
whole import. These checks validate extracted data; extraction accuracy still
requires review against the original file.
