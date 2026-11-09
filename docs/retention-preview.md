# Retention scenario preview

The retention page currently uses four illustrative pet and client records. Groom intervals, rabies dates, last package prices, and the 34-member/$4,890 monthly membership baseline are sample values. They are not read from the tenant ledger or a billing provider.

The top amount is the sum of sample prior package prices for candidates whose displayed weeks since groom exceed their displayed target. It is **not** recovered revenue, an expected conversion forecast, or a payment total. Previewing a recall does not change that value. The membership amount is a sample monthly list-price scenario; selecting an offer adds its price to the scenario only. No subscription or charge is created.

Recall actions mark sample rows as previewed and show an explicit no-SMS confirmation. The batch action changes only overdue rows that have not already been previewed, and disables when none remain. The global tour widget follows the page content so it does not cover the mobile scenario cards.

The production retention engine needs tenant-scoped completed-visit history, a documented coat-care cadence per pet, verified vaccination dates, consent and communication preferences, an SMS provider with delivery receipts, and membership/charge records from Stripe. Until those sources and consent checks exist, the page remains a labeled scenario preview.

`tests/e2e/retention-preview.spec.ts` checks the sample value, no-send/no-charge feedback, unchanged candidate value after batch preview, membership scenario arithmetic, and mobile width and widget placement.
