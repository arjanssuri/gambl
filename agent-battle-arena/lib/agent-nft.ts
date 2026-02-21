import { ethers } from "ethers";

// ─── Network Config ───────────────────────────────────────────────────────────

export const OG_TESTNET = {
  chainId: "0x40DA",           // 16602
  chainName: "0G Galileo Testnet",
  rpcUrls: ["https://evmrpc-testnet.0g.ai"],
  nativeCurrency: { name: "0G", symbol: "0G", decimals: 18 },
  blockExplorerUrls: ["https://chainscan-galileo.0g.ai"],
};

// ─── ABI (minimal — only what the frontend needs) ─────────────────────────────

export const AGENT_NFT_ABI = [
  // Mint
  "function mint(string name, string modelId, bytes32 strategyHash, string encryptedURI, bytes sealedKey) returns (uint256)",
  // Read
  "function getProfile(uint256 tokenId) view returns (tuple(string name, string modelId, bytes32 strategyHash, string encryptedURI, uint256 wins, uint256 losses, uint256 rating, uint256 mintedAt))",
  "function getBattleHistory(uint256 tokenId) view returns (tuple(uint256 matchId, bool won, int256 ratingDelta, uint256 timestamp)[])",
  "function getWinRate(uint256 tokenId) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  // Write
  "function recordBattle(uint256 tokenId, uint256 matchId, bool won)",
  "function updateStrategy(uint256 tokenId, bytes32 newHash, string newURI, bytes newSealedKey)",
  "function authorizeUsage(uint256 tokenId, address executor, bytes permissions)",
  // Events
  "event AgentMinted(uint256 indexed tokenId, address indexed owner, string name, string modelId)",
  "event BattleRecorded(uint256 indexed tokenId, uint256 matchId, bool won, uint256 newRating)",
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentProfile {
  name: string;
  modelId: string;
  strategyHash: string;
  encryptedURI: string;
  wins: bigint;
  losses: bigint;
  rating: bigint;
  mintedAt: bigint;
}

export interface BattleRecord {
  matchId: bigint;
  won: boolean;
  ratingDelta: bigint;
  timestamp: bigint;
}

export interface MintParams {
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Request MetaMask to add / switch to 0G Testnet */
export async function switchTo0GTestnet(): Promise<void> {
  const win = window as any;
  const evmProvider =
    win.ethereum?.providers?.find((p: any) => p.isMetaMask && !p.isPhantom) ??
    (win.ethereum?.isMetaMask && !win.ethereum?.isPhantom ? win.ethereum : null);
  if (!evmProvider) throw new Error("MetaMask not found");
  try {
    await evmProvider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: OG_TESTNET.chainId }],
    });
  } catch (err: any) {
    if (err.code === 4902) {
      await evmProvider.request({
        method: "wallet_addEthereumChain",
        params: [OG_TESTNET],
      });
    } else {
      throw err;
    }
  }
}

/** Get an ethers signer — targets MetaMask specifically, ignoring Phantom */
export async function getEVMSigner(): Promise<ethers.JsonRpcSigner> {
  const win = window as any;

  // When multiple wallets are installed, browsers expose window.ethereum.providers[]
  // Find MetaMask specifically (isMetaMask=true, isPhantom=false)
  let evmProvider = win.ethereum?.providers?.find(
    (p: any) => p.isMetaMask && !p.isPhantom
  );

  // Single wallet scenario — make sure it's MetaMask, not Phantom
  if (!evmProvider && win.ethereum?.isMetaMask && !win.ethereum?.isPhantom) {
    evmProvider = win.ethereum;
  }

  if (!evmProvider) {
    throw new Error(
      "MetaMask not found. Install MetaMask (metamask.io) — Phantom does not support the 0G network."
    );
  }

  const provider = new ethers.BrowserProvider(evmProvider);
  await provider.send("eth_requestAccounts", []);
  await switchTo0GTestnet();
  return provider.getSigner();
}


// ─── Main Client ──────────────────────────────────────────────────────────────

export class AgentNFTClient {
  private contract: ethers.Contract;

  constructor(contractAddress: string, signer: ethers.JsonRpcSigner) {
    this.contract = new ethers.Contract(contractAddress, AGENT_NFT_ABI, signer);
  }

  static async create(contractAddress: string): Promise<AgentNFTClient> {
    const signer = await getEVMSigner();
    return new AgentNFTClient(contractAddress, signer);
  }

  /** Create a read-only client using just the RPC URL — no wallet needed */
  static createReadOnly(contractAddress: string): AgentNFTClient {
    const provider = new ethers.JsonRpcProvider(OG_TESTNET.rpcUrls[0]);
    const instance = Object.create(AgentNFTClient.prototype) as AgentNFTClient;
    (instance as any).contract = new ethers.Contract(contractAddress, AGENT_NFT_ABI, provider);
    return instance;
  }

  /** Mint a new agent iNFT — just name + identity, no strategy attached. */
  async mintAgent(params: MintParams): Promise<{ tokenId: bigint; txHash: string }> {
    const { name } = params;
    const emptyHash = ethers.ZeroHash;
    const sealedKey = ethers.toUtf8Bytes("");
    const tx = await this.contract.mint(name, "", emptyHash, "", sealedKey);
    const receipt = await tx.wait();

    if (!receipt || receipt.status === 0) {
      throw new Error("Mint transaction reverted on-chain. Check your gas and try again.");
    }

    // Parse tokenId from AgentMinted event
    const event = receipt.logs
      .map((log: any) => { try { return this.contract.interface.parseLog(log); } catch { return null; } })
      .find((e: any) => e?.name === "AgentMinted");

    // Fallback: scan for the token we just minted if event parse failed
    let tokenId: bigint = event?.args?.tokenId ?? BigInt(-1);
    if (tokenId === BigInt(-1)) {
      const signer = this.contract.runner as ethers.JsonRpcSigner;
      const owned = await this.getTokensOf(await signer.getAddress());
      tokenId = owned.length > 0 ? owned[owned.length - 1] : BigInt(0);
    }

    return { tokenId, txHash: receipt.hash };
  }

  /** Get the full on-chain profile for a token */
  async getProfile(tokenId: bigint): Promise<AgentProfile> {
    return this.contract.getProfile(tokenId);
  }

  /** Get full battle history */
  async getBattleHistory(tokenId: bigint): Promise<BattleRecord[]> {
    return this.contract.getBattleHistory(tokenId);
  }

  /** Get win rate as a fraction (0–1) */
  async getWinRate(tokenId: bigint): Promise<number> {
    const raw: bigint = await this.contract.getWinRate(tokenId);
    return Number(raw) / 10000;
  }

  /** Record a battle result (owner or authorized recorder) */
  async recordBattle(tokenId: bigint, matchId: number, won: boolean): Promise<string> {
    const tx = await this.contract.recordBattle(tokenId, matchId, won);
    const receipt = await tx.wait();
    return receipt.hash;
  }


  /** Authorize a contract/address to record battles for this agent */
  async authorizeForBattles(tokenId: bigint, executor: string): Promise<string> {
    const permissions = ethers.toUtf8Bytes("record_battle");
    const tx = await this.contract.authorizeUsage(tokenId, executor, permissions);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /** Find token IDs owned by an address — event query with brute-force scan fallback */
  async getTokensOf(address: string): Promise<bigint[]> {
    // Try event filter first
    try {
      const filter = this.contract.filters.AgentMinted(null, address);
      const events = await this.contract.queryFilter(filter);
      if (events.length > 0) {
        return events.map((e: any) => e.args.tokenId as bigint);
      }
    } catch { /* RPC may not support event filtering — fall through */ }

    // Fallback: scan token IDs 0–19 and check ownership
    const owned: bigint[] = [];
    for (let i = 0; i < 20; i++) {
      try {
        const owner: string = await this.contract.ownerOf(BigInt(i));
        if (owner.toLowerCase() === address.toLowerCase()) {
          owned.push(BigInt(i));
        }
      } catch { break; } // ownerOf reverts for non-existent tokens
    }
    return owned;
  }

  get address(): string {
    return this.contract.target as string;
  }
}

// ─── Contract Address ─────────────────────────────────────────────────────────
// Updated automatically by deploy.js — edit after deploying

export const AGENT_NFT_ADDRESS =
  process.env.NEXT_PUBLIC_AGENT_NFT_ADDRESS ?? "";

// ─── Global client singleton ──────────────────────────────────────────────────
// Set when the user connects their EVM wallet on the NFT page.
// Used by the dashboard to call recordBattle without re-prompting.

let _activeClient: AgentNFTClient | null = null;

export function setActiveNFTClient(client: AgentNFTClient | null) {
  _activeClient = client;
}

export function getActiveNFTClient(): AgentNFTClient | null {
  return _activeClient;
}

/** Record a battle for the current user's agent. No-ops silently if no client is set. */
export async function recordBattleIfConnected(
  tokenId: number,
  matchId: number,
  won: boolean
): Promise<void> {
  if (!_activeClient || !AGENT_NFT_ADDRESS) return;
  try {
    await _activeClient.recordBattle(BigInt(tokenId), matchId, won);
  } catch {
    // Non-blocking — game result is already in Supabase
  }
}
