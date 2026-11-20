import Image from "@/ui/image";
import { CurrencyCircleDollarIcon } from "@phosphor-icons/react";

import { cryptoAssets, coinName } from "@/lib/crypto-assets";
export { coinName };

export function CoinIcon({ asset }: { asset: string }) {
  return cryptoAssets[asset] ? (
    <Image
      src={"/coins/" + asset.toLowerCase() + ".svg"}
      width={26}
      height={26}
      alt=""
      unoptimized
    />
  ) : (
    <CurrencyCircleDollarIcon size={26} aria-hidden="true" />
  );
}
