type Address = `0x${string}`;

type ContractSpec = {
  name: "vrbs" | "grounds";
  address: Address;
};

export const AUCTION_HOUSE_CONTRACTS = [
  { name: "vrbs", address: "0x4153b0310354b189e18797d5d7dfda2c924bdc3d" },
  { name: "grounds", address: "0xa79be6894c4817a67c6ef6c5b11e3e8cace95717" },
] as const satisfies readonly ContractSpec[];

export const CULTURE_INDEX_CONTRACTS = [
  { name: "vrbs", address: "0x5da551c18109b58831abe8a5b9edc5f9a8e4887c" },
  { name: "grounds", address: "0xee4f427ce740031c2e4fe04b0f05dc342bc51272" },
] as const satisfies readonly ContractSpec[];

export const REVOLUTION_DAO_CONTRACTS = [
  { name: "vrbs", address: "0x613b7ddca4b05355b3541f8c018b374987549e79" },
  { name: "grounds", address: "0xc052ace88f0a8dfc58ba10b9c6de02357fba0cd7" },
] as const satisfies readonly ContractSpec[];

const getAddresses = <T extends readonly { address: Address }[]>(items: T) =>
  items.map((item) => item.address) as readonly T[number]["address"][];

export const AUCTION_HOUSE_ADDRESSES = getAddresses(AUCTION_HOUSE_CONTRACTS);
export const CULTURE_INDEX_ADDRESSES = getAddresses(CULTURE_INDEX_CONTRACTS);
export const REVOLUTION_DAO_ADDRESSES = getAddresses(REVOLUTION_DAO_CONTRACTS);

export const VRBS_START_BLOCK = 11346628;
export const GROUNDS_START_BLOCK = 12698632;
