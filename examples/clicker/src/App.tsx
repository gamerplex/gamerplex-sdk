import { useCallback, useMemo, useState } from "react";
import { useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  ArcadeClient,
  paymentTokensFor,
  type PaymentTokenDef,
} from "@gamerplex/sdk/arcade";
import idl from "@gamerplex/sdk/idl/gamerplex_arcade.json";

const TOKENS = paymentTokensFor("devnet");
const FLIPBALL_GAME_ID = 5;

type Status = "idle" | "saving" | "success" | "error";

export default function App() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  const [clicks, setClicks] = useState(0);
  const [token, setToken] = useState<PaymentTokenDef>(TOKENS[0]);
  const [status, setStatus] = useState<Status>("idle");
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const client = useMemo(() => {
    if (!wallet) return null;
    return new ArcadeClient({ connection, wallet, network: "devnet", idl: idl as any });
  }, [connection, wallet]);

  const onSave = useCallback(async () => {
    if (!client || clicks === 0) return;
    setStatus("saving"); setErr(null); setSig(null);
    try {
      const sessionSeed = new Uint8Array(32);
      crypto.getRandomValues(sessionSeed);
      const tx = await client.saveScore({
        gameId: FLIPBALL_GAME_ID,
        score: clicks,
        sessionSeed,
        durationSec: 1,
        token: token.symbol,
        variant: "clicker",
        meta: `clicks:${clicks}`,
      });
      setSig(tx); setStatus("success");
    } catch (e: any) {
      setErr(e?.message?.slice(0, 200) ?? String(e));
      setStatus("error");
    }
  }, [client, clicks, token]);

  const expectedUsd = Math.floor((50_000 * (10_000 - token.discountBps)) / 10_000) / 1_000_000;

  return (
    <div style={s.panel}>
      <header style={s.header}>
        <h1 style={s.title}>ARCADE CLICKER</h1>
        <WalletMultiButton />
      </header>

      <p style={s.sub}>
        Smallest possible arcade game using <code>@gamerplex/sdk</code> v0.2.<br />
        Click → score. Save → on-chain via <code>ArcadeClient.saveScore()</code>.
      </p>

      <div style={s.counter}>
        <div style={s.bigNum}>{clicks}</div>
        <button style={s.clickBtn} onClick={() => setClicks((c) => c + 1)}>CLICK</button>
        {clicks > 0 && (
          <button style={s.resetBtn} onClick={() => setClicks(0)}>Reset</button>
        )}
      </div>

      <div style={s.tokens}>
        <div style={s.label}>PAY WITH</div>
        <div style={s.tokenRow}>
          {TOKENS.map((t) => (
            <button
              key={t.symbol}
              onClick={() => setToken(t)}
              style={{ ...s.tokenBtn, ...(t.symbol === token.symbol ? s.tokenBtnActive : {}) }}
              aria-pressed={t.symbol === token.symbol}
            >
              {t.symbol}
              {t.discountBps > 0 && <span style={s.badge}>−20%</span>}
            </button>
          ))}
        </div>
      </div>

      <button
        style={{ ...s.saveBtn, opacity: !wallet || clicks === 0 || status === "saving" ? 0.4 : 1 }}
        disabled={!wallet || clicks === 0 || status === "saving"}
        onClick={onSave}
      >
        {status === "saving" ? "Saving on-chain…" :
         status === "success" ? "✓ Saved on-chain" :
         `Save ${clicks} clicks · $${expectedUsd.toFixed(2)} · ${token.symbol}`}
      </button>

      {!wallet && <div style={s.hint}>Connect a wallet (top-right) to save</div>}

      {status === "success" && sig && (
        <div style={s.success}>
          <div style={s.label}>TX</div>
          <a href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={s.txLink}>
            {sig.slice(0, 16)}…{sig.slice(-16)} ↗
          </a>
        </div>
      )}

      {status === "error" && err && (
        <div style={s.error}>
          <div style={s.label}>ERROR</div>
          <code style={s.errText}>{err}</code>
        </div>
      )}

      <footer style={s.footer}>
        Source: <a href="https://github.com/gamerplex/gamerplex-sdk/tree/main/examples/clicker" target="_blank" rel="noopener noreferrer" style={s.footLink}>
          github.com/gamerplex/gamerplex-sdk/examples/clicker
        </a>
      </footer>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  panel: { background: "#14141f", border: "1px solid #2a2a3a", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 18, fontWeight: 900, letterSpacing: 1, color: "#00f2ff", background: "linear-gradient(135deg,#00f2ff,#9945FF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  sub: { fontSize: 12, color: "#6a6a80", lineHeight: 1.6 },
  counter: { display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "20px 0", borderTop: "1px solid #2a2a3a", borderBottom: "1px solid #2a2a3a" },
  bigNum: { fontSize: 72, fontWeight: 900, color: "#14F195", fontVariantNumeric: "tabular-nums", letterSpacing: -2 },
  clickBtn: { background: "#9945FF", color: "#fff", border: "none", padding: "16px 48px", borderRadius: 999, fontSize: 18, fontWeight: 900, letterSpacing: 1, cursor: "pointer", boxShadow: "0 0 24px rgba(153,69,255,0.35)" },
  resetBtn: { background: "transparent", color: "#6a6a80", border: "1px solid #2a2a3a", padding: "6px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer" },
  tokens: { display: "flex", flexDirection: "column", gap: 8 },
  label: { fontSize: 10, letterSpacing: 1.2, color: "#6a6a80", textTransform: "uppercase" },
  tokenRow: { display: "flex", gap: 8 },
  tokenBtn: { flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #2a2a3a", background: "#0e0e1a", color: "#cfd0dc", fontSize: 12, fontWeight: 700, cursor: "pointer" },
  tokenBtnActive: { borderColor: "#00f2ff", background: "rgba(0,242,255,0.12)", color: "#fff", boxShadow: "0 0 12px rgba(0,242,255,0.25)" },
  badge: { display: "inline-block", marginLeft: 6, padding: "1px 5px", borderRadius: 999, background: "rgba(255,0,170,0.18)", color: "#ff5fb6", fontSize: 9, fontWeight: 800, letterSpacing: 0.4 },
  saveBtn: { background: "#14F195", color: "#050508", border: "none", padding: "14px 24px", borderRadius: 10, fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: 0.3, boxShadow: "0 0 24px rgba(20,241,149,0.4)" },
  hint: { fontSize: 11, color: "#6a6a80", textAlign: "center" },
  success: { display: "flex", flexDirection: "column", gap: 6, padding: 14, background: "rgba(20,241,149,0.06)", border: "1px solid rgba(20,241,149,0.3)", borderRadius: 8 },
  txLink: { color: "#14F195", textDecoration: "none", fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" },
  error: { display: "flex", flexDirection: "column", gap: 6, padding: 14, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8 },
  errText: { color: "#ef4444", fontSize: 11, lineHeight: 1.5, wordBreak: "break-all", fontFamily: "monospace" },
  footer: { fontSize: 10, color: "#3a3a50", textAlign: "center", marginTop: 8, paddingTop: 16, borderTop: "1px solid #1a1a28" },
  footLink: { color: "#6a6a80", textDecoration: "none" },
};
