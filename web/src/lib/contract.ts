export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`;

export const ABI = [
  {"type":"function","name":"mintEnergy","inputs":[
    {"name":"weatherFactorBps","type":"uint256"},
    {"name":"clouds","type":"uint256"}],
    "outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"useEnergy","inputs":[
    {"name":"amount","type":"uint256"}],
    "outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"tokenPrice","inputs":[],"outputs":[{"type":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"totalSupply","inputs":[],"outputs":[{"type":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"balanceOf","inputs":[{"name":"owner","type":"address"}],"outputs":[{"type":"uint256"}],"stateMutability":"view"},
  {"type":"function","name":"lastCloudPct","inputs":[],"outputs":[{"type":"uint256"}],"stateMutability":"view"}
] as const;
