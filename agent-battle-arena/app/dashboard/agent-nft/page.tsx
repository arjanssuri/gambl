"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  AgentNFTClient,
  AGENT_NFT_ADDRESS,
  OG_TESTNET,
  getEVMSigner,
  requestAccountSwitch,
  setActiveNFTClient,
  type AgentProfile,
  type BattleRecord,
} from "@/lib/agent-nft";
import { getAgentAvatarUri } from "@/lib/agent-avatar";
import { saveAgentNFT, getProfileData, clearAgentNFT } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = "idle" | "connecting" | "minting" | "loading" | "error";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncateAddr(addr: string): string {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatTimestamp(ts: bigint): string {
  return new Date(Number(ts) * 1000).toLocaleString();
}

function winRateDisplay(profile: AgentProfile): string {
  const total = Number(profile.wins) + Number(profile.losses);
  if (total === 0) return "—";
  return ((Number(profile.wins) / total) * 100).toFixed(1) + "%";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">
      {children}
    </span>
  );
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="border border-[#424242] bg-[#0d0d0d] p-4 flex flex-col gap-1">
      <Label>{label}</Label>
      <span
        className={`text-2xl font-mono font-bold ${accent ? "text-[#FF1A1A]" : "text-white"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AgentNFTPage() {
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [client, setClient] = useState<AgentNFTClient | null>(null);
  const [tokenId, setTokenId] = useState<bigint | null>(null);
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [battleHistory, setBattleHistory] = useState<BattleRecord[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [showMintPrompt, setShowMintPrompt] = useState(false);

  // ── Auto-load on mount: use Supabase-saved token + read-only RPC (no wallet needed) ──
  useEffect(() => {
    if (!AGENT_NFT_ADDRESS) return;
    async function tryAutoLoad() {
      try {
        const supabaseProfile = await getProfileData();
        if (supabaseProfile?.agent_token_id != null && supabaseProfile?.agent_evm_address) {
          const tid = BigInt(supabaseProfile.agent_token_id);
          const addr = supabaseProfile.agent_evm_address;
          setEvmAddress(addr);
          setTokenId(tid);
          const readOnly = AgentNFTClient.createReadOnly(AGENT_NFT_ADDRESS);
          await loadProfile(readOnly, tid);
          localStorage.setItem("gambl_agent_address", addr);
          localStorage.setItem("gambl_agent_tokenId", tid.toString());
          return;
        }
      } catch { /* fall through to MetaMask check */ }

      // No saved NFT — don't auto-connect, let user click "Connect MetaMask"
    }
    tryAutoLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-load profile when tokenId + client are both ready ─────────────────
  const loadProfile = useCallback(
    async (c: AgentNFTClient, tid: bigint) => {
      setStatus("loading");
      try {
        const [p, bh] = await Promise.all([
          c.getProfile(tid),
          c.getBattleHistory(tid),
        ]);
        setProfile(p);
        setBattleHistory(bh);
        if (p.name) localStorage.setItem("gambl_agent_name", p.name);
        setStatus("idle");
      } catch (e: any) {
        setStatus("error");
        setErrorMsg("Failed to load profile: " + e.message);
      }
    },
    []
  );

  // ── Connect MetaMask ────────────────────────────────────────────────────────
  async function connectMetaMask() {
    if (!AGENT_NFT_ADDRESS) {
      setStatus("error");
      setErrorMsg(
        "Contract not deployed yet. Set NEXT_PUBLIC_AGENT_NFT_ADDRESS in .env.local after deploying."
      );
      return;
    }
    setStatus("connecting");
    setErrorMsg("");
    try {
      const signer = await getEVMSigner();
      const addr = await signer.getAddress();
      const c = new AgentNFTClient(AGENT_NFT_ADDRESS, signer);
      setEvmAddress(addr);
      setClient(c);
      setActiveNFTClient(c);

      // Read old cached values BEFORE overwriting with new address
      const savedToken = localStorage.getItem("gambl_agent_tokenId");
      const savedAddr = localStorage.getItem("gambl_agent_address");
      localStorage.setItem("gambl_agent_address", addr);

      // Only use cached tokenId if it belongs to this same wallet
      if (savedToken && savedAddr?.toLowerCase() === addr.toLowerCase()) {
        const tid = BigInt(savedToken);
        setTokenId(tid);
        await loadProfile(c, tid);
      } else {
        // Different wallet or no saved token — scan for owned tokens
        localStorage.removeItem("gambl_agent_tokenId");
        localStorage.removeItem("gambl_agent_name");
        const tokens = await c.getTokensOf(addr);
        if (tokens.length > 0) {
          const tid = tokens[tokens.length - 1];
          setTokenId(tid);
          localStorage.setItem("gambl_agent_tokenId", tid.toString());
          await loadProfile(c, tid);
        } else {
          // No NFT on this wallet — clear any stale Supabase record
          try {
            const { clearAgentNFT } = await import("@/lib/auth");
            await clearAgentNFT();
          } catch { /* non-blocking */ }
          setStatus("idle");
          setShowMintPrompt(true);
        }
      }
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  }

  // ── Mint ────────────────────────────────────────────────────────────────────
  async function mintAgent() {
    setStatus("minting");
    setErrorMsg("");
    setSuccessMsg("");
    let activeClient = client;
    try {
      if (!activeClient) {
        // Auto-connect MetaMask — get a fresh signer directly
        const signer = await getEVMSigner();
        const addr = await signer.getAddress();
        activeClient = new AgentNFTClient(AGENT_NFT_ADDRESS, signer);
        setClient(activeClient);
        setActiveNFTClient(activeClient);
        setEvmAddress(addr);
        localStorage.setItem("gambl_agent_address", addr);
      }
    } catch (e: any) {
      setStatus("error"); setErrorMsg(e.message); return;
    }
    try {
      const supabaseProfile = await getProfileData();
      const name = supabaseProfile?.display_name?.trim() || "Agent";
      const { tokenId: tid, txHash } = await activeClient.mintAgent({ name });
      setTokenId(tid);
      localStorage.setItem("gambl_agent_tokenId", tid.toString());
      try {
        await saveAgentNFT(tid, activeClient.address);
      } catch { /* non-blocking */ }
      setShowMintPrompt(false);
      await loadProfile(activeClient, tid);
      setMintTxHash(txHash);
      setSuccessMsg(`Agent minted on 0G Chain`);
    } catch (e: any) {
      setStatus("error");
      setErrorMsg(e.message);
    }
  }


  // ── Switch Wallet ──────────────────────────────────────────────────────────
  async function switchWallet() {
    setStatus("connecting");
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const signer = await requestAccountSwitch();
      const addr = await signer.getAddress();

      // Clear old state
      setClient(null);
      setTokenId(null);
      setProfile(null);
      setBattleHistory(null);
      setShowMintPrompt(false);
      setMintTxHash(null);
      localStorage.removeItem("gambl_agent_tokenId");
      localStorage.removeItem("gambl_agent_name");

      // Set up new wallet
      const c = new AgentNFTClient(AGENT_NFT_ADDRESS, signer);
      setEvmAddress(addr);
      setClient(c);
      setActiveNFTClient(c);
      localStorage.setItem("gambl_agent_address", addr);

      // Scan for tokens on new wallet
      const tokens = await c.getTokensOf(addr);
      if (tokens.length > 0) {
        const tid = tokens[tokens.length - 1];
        setTokenId(tid);
        localStorage.setItem("gambl_agent_tokenId", tid.toString());
        await saveAgentNFT(tid, addr);
        await loadProfile(c, tid);
      } else {
        await clearAgentNFT();
        setStatus("idle");
        setShowMintPrompt(true);
      }
    } catch (e: any) {
      if (e.code === 4001) {
        // User rejected — just go back to idle
        setStatus("idle");
      } else {
        setStatus("error");
        setErrorMsg(e.message);
      }
    }
  }

  // ── Authorize ───────────────────────────────────────────────────────────────
  const isContractMissing = !AGENT_NFT_ADDRESS;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-mono">
      <div className="max-w-3xl mx-auto px-4 pt-28 pb-12 space-y-8">

        {/* ── Back nav ── */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
        >
          <span>&larr;</span> Back to Dashboard
        </Link>

        {/* ── Header ── */}
        <div className="border-b border-[#424242] pb-6">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                AGENT NFT
              </h1>
              <p className="text-xs text-white/40 mt-1 max-w-sm leading-relaxed">
                Your on-chain AI agent identity — powered by 0G iNFT (ERC-7857)
              </p>
            </div>
            <div className="flex items-center gap-2 border border-[#424242] px-3 py-1.5 text-xs text-white/40">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF1A1A] inline-block" />
              {OG_TESTNET.chainName}
            </div>
          </div>
        </div>

        {/* ── Contract not deployed warning ── */}
        {isContractMissing && (
          <div className="border border-yellow-600/40 bg-yellow-600/5 p-4 text-xs text-yellow-400 leading-relaxed">
            <strong>Contract not deployed.</strong> Run{" "}
            <code className="bg-white/10 px-1">npm run deploy:testnet</code> in{" "}
            <code className="bg-white/10 px-1">/contracts</code>, then set{" "}
            <code className="bg-white/10 px-1">NEXT_PUBLIC_AGENT_NFT_ADDRESS</code> in{" "}
            <code className="bg-white/10 px-1">.env.local</code>.
          </div>
        )}

        {/* ── Success banner ── */}
        {successMsg && (
          <div className="border border-[#FF1A1A]/30 bg-[#FF1A1A]/5 p-3 flex items-start justify-between gap-4">
            <div className="text-xs text-[#FF1A1A] break-all leading-relaxed">
              {successMsg}
              {mintTxHash && (
                <>
                  {" — "}
                  <a
                    href={`https://chainscan-galileo.0g.ai/tx/${mintTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-white transition-colors"
                  >
                    View on 0G Explorer
                  </a>
                </>
              )}
            </div>
            <button
              onClick={() => { setSuccessMsg(""); setMintTxHash(null); }}
              className="text-white/30 hover:text-white text-xs shrink-0"
            >
              X
            </button>
          </div>
        )}

        {/* ── Error banner ── */}
        {status === "error" && errorMsg && (
          <div className="border border-red-600/40 bg-red-600/5 p-3 flex items-start justify-between gap-4">
            <p className="text-xs text-red-400 break-all leading-relaxed">{errorMsg}</p>
            <button
              onClick={() => { setStatus("idle"); setErrorMsg(""); }}
              className="text-white/30 hover:text-white text-xs shrink-0"
            >
              X
            </button>
          </div>
        )}

        {/* ── EVM Wallet bar — only shown when no NFT is linked yet ── */}
        {!profile && (
          <div className="border border-[#424242] p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <Label>EVM Wallet (0G Chain)</Label>
              {evmAddress ? (
                <p className="text-sm text-white mt-1">
                  {truncateAddr(evmAddress)}
                  <span className="ml-2 text-[10px] text-green-400 border border-green-400/30 px-1.5 py-0.5">
                    CONNECTED
                  </span>
                </p>
              ) : (
                <p className="text-xs text-white/30 mt-1">Not connected — required to mint</p>
              )}
            </div>
            <div className="flex gap-2">
              {evmAddress && (
                <button
                  onClick={switchWallet}
                  disabled={status === "connecting"}
                  className="border border-[#424242] text-white/40 text-xs uppercase tracking-widest px-4 py-2 hover:border-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
                >
                  Switch Wallet
                </button>
              )}
              {!evmAddress && (
                <button
                  onClick={connectMetaMask}
                  disabled={status === "connecting" || isContractMissing}
                  className="border border-[#FF1A1A] text-[#FF1A1A] text-xs uppercase tracking-widest px-4 py-2 hover:bg-[#FF1A1A] hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {status === "connecting" ? "CONNECTING…" : "Connect MetaMask"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Mint Prompt ── */}
        {evmAddress && showMintPrompt && (
          <div className="border border-[#424242] p-6 space-y-4">
            <p className="text-xs text-white/50">
              Your agent NFT will be minted on 0G Chain using your display name. This is your permanent on-chain identity.
            </p>
            <div className="flex gap-3">
              <button
                onClick={mintAgent}
                disabled={status === "minting"}
                className="flex-1 bg-[#FF1A1A] text-black text-sm font-bold uppercase tracking-widest py-3 hover:bg-[#e61515] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "minting" ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-3 h-3 border border-black border-t-transparent rounded-full" />
                    MINTING…
                  </span>
                ) : "MINT AGENT NFT"}
              </button>
              <button
                onClick={() => setShowMintPrompt(false)}
                className="border border-[#424242] text-white/40 text-xs uppercase tracking-widest px-4 py-2 hover:border-white/30 hover:text-white/60 transition-colors"
              >
                CANCEL
              </button>
            </div>
          </div>
        )}

        {/* ── Loading state ── */}
        {status === "loading" && (
          <div className="border border-[#424242] p-8 flex items-center justify-center gap-3">
            <span className="animate-spin inline-block w-4 h-4 border border-white/30 border-t-white rounded-full" />
            <span className="text-xs text-white/40 uppercase tracking-widest">Loading agent…</span>
          </div>
        )}

        {/* ── Agent Profile Card ── */}
        {profile && tokenId !== null && status !== "loading" && (
          <div className="space-y-5">

            {/* Identity header */}
            <div className="border border-[#424242] p-6 space-y-3">
              <div className="flex items-start gap-5 flex-wrap">
                {/* Avatar */}
                <img
                  src={getAgentAvatarUri(Number(tokenId), profile.name)}
                  alt={profile.name}
                  className="w-24 h-24 border border-[#424242] shrink-0"
                />
                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#FF1A1A] mb-1">
                    AGENT #{tokenId.toString()}
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">
                    {profile.name || "—"}
                  </h2>
                  <a
                    href={`https://chainscan-galileo.0g.ai/address/${evmAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-white/30 mt-1 font-mono hover:text-[#FF1A1A] transition-colors underline underline-offset-2"
                  >
                    {evmAddress}
                  </a>
                </div>
              </div>


              {/* Minted at */}
              <div className="space-y-1">
                <Label>Minted</Label>
                <p className="text-xs text-white/40">
                  {profile.mintedAt ? formatTimestamp(profile.mintedAt) : "—"}
                </p>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-px border border-[#424242]">
              <StatBox label="Rating" value={profile.rating?.toString() ?? "—"} accent />
              <StatBox label="Wins" value={profile.wins?.toString() ?? "0"} />
              <StatBox label="Losses" value={profile.losses?.toString() ?? "0"} />
              <StatBox label="Win Rate" value={winRateDisplay(profile)} />
            </div>

            {/* Battle History */}
            <div className="border border-[#424242]">
              <div className="border-b border-[#424242] px-4 py-3">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                  Battle History
                </span>
              </div>
              {!battleHistory || battleHistory.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-white/20">No battles recorded on-chain yet.</p>
                  <p className="text-[10px] text-white/15 mt-1">
                    Battle outcomes will appear here after matches complete.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#2a2a2a]">
                        <th className="text-left px-4 py-2 text-white/30 font-normal">MATCH</th>
                        <th className="text-left px-4 py-2 text-white/30 font-normal">RESULT</th>
                        <th className="text-left px-4 py-2 text-white/30 font-normal">RATING</th>
                        <th className="text-left px-4 py-2 text-white/30 font-normal">DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...battleHistory].reverse().map((b, i) => (
                        <tr key={i} className="border-b border-[#1a1a1a] hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-white/60">#{b.matchId.toString()}</td>
                          <td className="px-4 py-2">
                            <span className={b.won ? "text-green-400" : "text-red-400"}>
                              {b.won ? "WIN" : "LOSS"}
                            </span>
                          </td>
                          <td className={`px-4 py-2 ${b.ratingDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {b.ratingDelta >= 0 ? "+" : ""}{b.ratingDelta.toString()}
                          </td>
                          <td className="px-4 py-2 text-white/30">
                            {formatTimestamp(b.timestamp)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
              <button
                onClick={switchWallet}
                disabled={status === "connecting"}
                className="border border-[#424242] text-white/40 text-xs uppercase tracking-widest px-5 py-2.5 hover:border-white/30 hover:text-white/60 transition-colors disabled:opacity-40"
              >
                Switch Wallet
              </button>
              <button
                onClick={() => client && loadProfile(client, tokenId)}
                disabled={status !== "idle"}
                className="border border-[#2a2a2a] text-white/25 text-xs uppercase tracking-widest px-5 py-2.5 hover:border-[#424242] hover:text-white/50 transition-colors disabled:opacity-40 ml-auto"
              >
                REFRESH
              </button>
            </div>
          </div>
        )}

        {/* ── No agent + not showing form ── */}
        {evmAddress && !showMintPrompt && !profile && status === "idle" && (
          <div className="border border-dashed border-[#424242] p-12 text-center space-y-3">
            <p className="text-white/30 text-sm">No agent NFT found for this address.</p>
            <button
              onClick={() => setShowMintPrompt(true)}
              className="text-xs text-[#FF1A1A] underline underline-offset-4 hover:text-[#e61515]"
            >
              Mint your first agent
            </button>
          </div>
        )}

        {/* ── Not connected placeholder ── */}
        {!evmAddress && status === "idle" && (
          <div className="border border-dashed border-[#424242] p-12 text-center space-y-2">
            <p className="text-white/20 text-sm">Connect your EVM wallet to manage your agent NFT.</p>
            <p className="text-white/15 text-xs">Requires MetaMask on 0G Galileo Testnet.</p>
          </div>
        )}

      </div>
    </div>
  );
}
