# Invite conversion improvement plan

After 30 days, booking safety is healthy and 34% of bookers create an invite. The problem is that only 11% of invite opens lead to a claimed spot, below the 25% target. Vouches convert better than public links, and most opens are mobile.

## Diagnose

First, check whether the 11% number is trustworthy. The prototype records raw invite opens, claims, rail counts, booking results, and availability receipts. It does not yet remove preview bots, deduplicate repeated opens, or reliably identify a human visitor. Before changing the product, add stable anonymous IDs, event IDs, bot filtering, clear failure reasons, and real treatment/holdout assignment.

Then compare \`opened -> claim started -> claim succeeded\` by rail, phone type, browser, available spots at open, time until the activity starts, load time, and error reason. The main hypotheses are: the mobile claim flow is too long, public links lack enough context or trust, people arrive after the activity is almost full, and raw opens make conversion look lower than it is.

## Improve

| Priority | Future change                                                                                                                                | Expected impact / effort |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1        | Shorten the mobile claim flow. Show inviter, activity, time, price, and live spots first; keep typed details after an error.                 | High / medium            |
| 2        | Add deep links with a web fallback and faster invite loading.                                                                                | High / medium            |
| 3        | Give public links more context, such as an optional inviter message and safe plan context. Encourage a vouch when inviting one known person. | Medium / low             |
| 4        | Give full or low-stock invites a useful recovery path, such as a waitlist or similar activities. Do not silently reserve capacity.           | Medium / medium          |
| 5        | Build trustworthy funnel tracking and a real randomized holdout.                                                                             | High / low               |

These are proposed improvements. They are not already in the prototype.

## Prove

Assign eligible inviters randomly and permanently to the current or improved invite experience. Keep a no-invite holdout for measuring whether invites create more claimed guests and plans, rather than simply attracting already-engaged users.

Use distinct eligible human opens that become claims as the diagnostic measure. Use claimed guests per inviter and completed plans as the decision measures. Watch for oversells, booking success below 99.5%, availability p95 above two seconds, more errors, slower pages, duplicate claims, or abuse. Run for two full weekly cycles and report confidence intervals by rail and device.

## Decide

Run at most two measured improvements. Keep and expand a rail only if it increases claimed guests or completed plans compared with the no-invite holdout without harming booking safety. If vouches work but public links do not, make vouches the main option and reduce public sharing. If neither rail creates more claims or plans after two powered tests, remove invite promotion instead of keeping it only because people generate codes.
