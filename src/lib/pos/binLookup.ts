import { prisma } from "@/lib/db";
import { checkCardBin, ekychubConfigured } from "@/lib/partners/ekychub";
import { generateRefId } from "@/lib/utils";

export interface BinResult {
  bin: string;
  cardNetwork: string;
  cardType: string;
  cardLevel: string;
  country: string;
  issuerBank: string;
}

/**
 * Look up card BIN classification. Checks the local cache first;
 * on miss, calls eKYC Hub and caches the result permanently (BINs are static).
 * Returns null if the lookup fails or the provider is not configured.
 */
export async function lookupBin(cardNumber: string): Promise<BinResult | null> {
  const bin = cardNumber.replace(/\D/g, "").slice(0, 6);
  if (bin.length < 6) return null;

  const cached = await prisma.cardBinCache.findUnique({ where: { bin } });
  if (cached) {
    return {
      bin: cached.bin,
      cardNetwork: cached.cardNetwork,
      cardType: cached.cardType,
      cardLevel: cached.cardLevel,
      country: cached.country,
      issuerBank: cached.issuerBank,
    };
  }

  if (!ekychubConfigured()) return null;

  const result = await checkCardBin({ card: bin, orderid: generateRefId("BIN") });
  if (!result.ok) return null;

  const data = result.data;
  const entry: BinResult = {
    bin: data.bin || bin,
    cardNetwork: data.cardNetwork || "",
    cardType: data.cardType || "",
    cardLevel: data.cardLevel || "",
    country: data.country || "",
    issuerBank: data.issuerBank || "",
  };

  await prisma.cardBinCache.upsert({
    where: { bin },
    update: {},
    create: {
      bin,
      cardNetwork: entry.cardNetwork,
      cardType: entry.cardType,
      cardLevel: entry.cardLevel,
      country: entry.country,
      issuerBank: entry.issuerBank,
    },
  });

  return entry;
}
