type MediaType = "image" | "video" | "text" | "audio" | null;

const INLINE_SVG_PREFIX = "data:image/svg+xml;base64,";

export const generateSubmissionSlug = (
  chainId: number,
  contractAddress: string,
  pieceId: string,
) => `${chainId}:${contractAddress.toLowerCase()}:${pieceId}`;

export const normalizeAddress = (address: string) => address.toLowerCase();

export const toBlockTimestamp = (timestamp: bigint) => new Date(Number(timestamp) * 1000);

export const getMediaType = (mediaType: number): MediaType => {
  switch (mediaType) {
    case 1:
      return "image";
    case 2:
      return "video";
    case 3:
      return "audio";
    case 4:
      return "text";
    default:
      return null;
  }
};

export const isSupportedMediaUrl = (url: string | null | undefined) => {
  if (!url) return false;
  return url.startsWith("ipfs://") || url.includes(INLINE_SVG_PREFIX);
};

export const convertIpfsToHttp = (
  url: string,
  provider:
    | "nftstorage"
    | "ipfs"
    | "cloudflare"
    | "mypinata"
    | "decentralized-content" = "mypinata",
) => {
  if (!url) return "";
  if (!url.startsWith("ipfs://")) return url;
  const hash = url.replace("ipfs://", "");

  const domains: Record<typeof provider, string> = {
    nftstorage: "nftstorage.link",
    ipfs: "ipfs.io",
    cloudflare: "cloudflare-ipfs.com",
    mypinata: "revolution.mypinata.cloud",
    "decentralized-content": "magic.decentralized-content.com",
  };

  return `https://${domains[provider]}/ipfs/${hash}`;
};
