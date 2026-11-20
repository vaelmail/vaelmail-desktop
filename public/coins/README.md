Coin icons are self-hosted from https://github.com/spothq/cryptocurrency-icons (`svg/color`). Their CC0 1.0 Universal license is included in LICENSE.md. Unknown assets use the existing Phosphor currency icon. Icons are decorative; the asset/network label supplies the accessible name.

Footer additions verified 2026-10-08:
- POL and SHIB use the background SVGs from [Web3 Icons](https://github.com/0xa3k5/web3icons), pinned to revision `763a55d66a03b21b603eb249f2df7c64a7522089`, fetched through jsDelivr. The MIT license is in WEB3ICONS-LICENSE.txt.
- GRAM, NOT and DOGS use OxaPay's own currency illustrations: `https://oxapay.com/_next/static/media/gram.3bcfae23.svg`, `https://oxapay.com/_next/static/media/notcoin.ea9f8fc1.svg`, `https://oxapay.com/_next/static/media/dogs.5db813ac.svg`. These are third-party brand marks, used to identify accepted payments, and are not covered by the CC0/MIT licenses above.

All footer coins are served locally. The public display list is in `src/lib/accepted-crypto.ts`, checked against the merchant's accepted currencies and enabled networks; update that snapshot when merchant settings change. Duration-specific live checkout eligibility remains authoritative.

TON was added on 2026-11-10 from the same pinned Web3 Icons revision and MIT-licensed background token set used for POL/SHIB. Required by the Heleket currency snapshot and native footer.
