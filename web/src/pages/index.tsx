// web/src/pages/index.tsx
import { useEffect, useMemo, useState } from "react";
const isBrowser = typeof window !== "undefined";


/**
 * Offline Simulation: SolarToken (no blockchain)
 *
 * - Simulates daily kWh production for a household (random or using OpenWeather cloud%).
 * - Converts produced kWh -> SLR tokens (1 kWh => TOKEN_PER_KWH).
 * - Price (internal unit) moves inversely with supply and directly with scarcity from burns.
 * - If NEXT_PUBLIC_OPENWEATHER_API_KEY exists in .env.local, it will fetch real clouds% for the given lat/lon.
 *
 * Demo flows:
 * 1) Get Weather -> shows clouds% (or sim)
 * 2) Click "Simulate Production" -> mints tokens into your wallet (local)
 * 3) "Use Energy" burns tokens (reducing supply) and increases price
 * 4) "Sell Excess" sells tokens for simulated cash (removes tokens, increases cash)
 *
 * NOTE: This is purely front-end simulation intended for hackathon demo when testnet / metamask is unavailable.
 */

const DEFAULT_LAT = Number(process.env.NEXT_PUBLIC_LAT ?? 37.8039);
const DEFAULT_LON = Number(process.env.NEXT_PUBLIC_LON ?? -122.4011);
const OWM_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY ?? "";

const TOKEN_PER_KWH = 10; // 1 kWh = 10 SLR tokens (demo conversion)
const BASE_PRICE = 1.0; // internal price unit (u)
const MIN_FACTOR_BPS = 8000; // 0.8x mint when very cloudy
const MAX_FACTOR_BPS = 12000; // 1.2x mint when sunny

function readLS() {
  try {
    const raw = localStorage.getItem("solarsim");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function writeLS(s: any) {
  try {
    localStorage.setItem("solarsim", JSON.stringify(s));
  } catch {}
}

export default function Page() {
  // persistent state
  const persisted = readLS();
  const [addrLabel] = useState("Household A (local)"); // for demo only
  const [tokens, setTokens] = useState<number>(persisted?.tokens ?? 0); // SLR balance
  const [supply, setSupply] = useState<number>(persisted?.supply ?? 0); // total supply
  const [cash, setCash] = useState<number>(persisted?.cash ?? 0); // simulated money
  const [price, setPrice] = useState<number>(persisted?.price ?? BASE_PRICE); // internal price unit
  const [lat, setLat] = useState<string>(String(DEFAULT_LAT));
  const [lon, setLon] = useState<string>(String(DEFAULT_LON));
  const [clouds, setClouds] = useState<number | null>(persisted?.clouds ?? null);
  const [weatherDesc, setWeatherDesc] = useState<string>(persisted?.weatherDesc ?? "");
  const [log, setLog] = useState<string[]>(persisted?.log ?? []);

  // convenience
  useEffect(() => {
    writeLS({ tokens, supply, cash, price, clouds, weatherDesc, log });
  }, [tokens, supply, cash, price, clouds, weatherDesc, log]);

  // compute factor from clouds% (basis points)
  const factorBps = useMemo(() => {
    if (clouds === null) return 10000;
    // linear mapping: 0% clouds -> MAX_FACTOR_BPS, 100% -> MIN_FACTOR_BPS
    const f = Math.round(((100 - clouds) * (MAX_FACTOR_BPS - MIN_FACTOR_BPS)) / 100 + MIN_FACTOR_BPS);
    return Math.max(MIN_FACTOR_BPS, Math.min(MAX_FACTOR_BPS, f));
  }, [clouds]);

  // derived UI text
  const factorText = useMemo(() => (factorBps / 100).toFixed(2) + "x", [factorBps]);

  // Helpers
  const pushLog = (s: string) => setLog((p) => [new Date().toLocaleTimeString() + " — " + s, ...p].slice(0, 50));

  // Weather fetch (uses OpenWeather if key present, otherwise sim)
  async function fetchWeather() {
    setWeatherDesc("fetching...");
    setClouds(null);
    try {
      if (OWM_KEY) {
        const la = parseFloat(lat);
        const lo = parseFloat(lon);
        const res = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${la}&lon=${lo}&appid=${OWM_KEY}&units=metric`
        );
        const j = await res.json();
        const c = j?.clouds?.all ?? Math.floor(Math.random() * 100);
        const desc = j?.weather?.[0]?.description ?? "n/a";
        setClouds(Number(c));
        setWeatherDesc(String(desc));
        pushLog(`Weather fetched: ${c}% clouds (${desc})`);
      } else {
        // simulate clouds
        const c = Math.floor(Math.random() * 100);
        setClouds(c);
        setWeatherDesc("simulated");
        pushLog(`Weather simulated: ${c}% clouds`);
      }
    } catch (e) {
      const c = Math.floor(Math.random() * 100);
      setClouds(c);
      setWeatherDesc("simulated-error");
      pushLog(`Weather fallback simulated: ${c}% clouds`);
    }
  }

  // Simulate daily production (kWh) - random with bias by clouds
  function simulateProduction() {
    // higher clouds => lower production
    const clr = clouds ?? Math.floor(Math.random() * 100);
    // base daily prod between 0.5 — 8 kWh, scaled by (1 - clouds%)
    const base = Math.random() * 7.5 + 0.5;
    const prod = Math.max(0.1, Math.round((base * (100 - clr)) / 100 * 10) / 10); // one decimal kWh
    // convert to tokens
    const mintedTokens = Math.round(prod * TOKEN_PER_KWH);
    setTokens((t) => t + mintedTokens);
    setSupply((s) => s + mintedTokens);

    // adjust price inversely: newPrice = price * (10000 / factor)
    setPrice((old) => {
      const newP = +(old * 10000) / factorBps;
      pushLog(`Produced ${prod} kWh -> minted ${mintedTokens} SLR. Price moved ${old.toFixed(3)} → ${newP.toFixed(3)}`);
      return Number(newP.toFixed(6));
    });
  }

  // Use (burn) tokens
  function useEnergy(burnAmount: number) {
    if (burnAmount <= 0) return;
    if (burnAmount > tokens) {
      alert("Not enough tokens to burn");
      return;
    }
    const supplyBefore = supply;
    setTokens((t) => t - burnAmount);
    setSupply((s) => s - burnAmount);

    // percent burned of prior supply (in bps)
    const pctBps = Math.round((burnAmount * 10000) / (supplyBefore || 1));
    // effect: price increases a bit: price *= (1 + pctBps*0.005%)
    // simpler: delta = pctBps * 0.0005 => example: 100 bps => 0.05 => +5%
    setPrice((old) => {
      const delta = (pctBps * 0.0005);
      const newP = old * (1 + delta);
      pushLog(`Burned ${burnAmount} SLR. Price increased ${old.toFixed(3)} → ${newP.toFixed(3)}`);
      return Number(newP.toFixed(6));
    });
  }

  // Sell tokens for simulated cash (price * amount)
  function sellExcess(amount: number) {
    if (amount <= 0) return;
    if (amount > tokens) {
      alert("Not enough tokens to sell");
      return;
    }
    // cash amount uses current price (internal unit) * amount (we'll use price as $/token for demo)
    const cashOut = +(price * amount);
    setTokens((t) => t - amount);
    setSupply((s) => s - amount);
    setCash((c) => Number((c + cashOut).toFixed(2)));
    pushLog(`Sold ${amount} SLR for $${cashOut.toFixed(2)} (sim).`);
    // slight price drop due to more sold -> fewer tokens in circulation? We'll reduce price by small percent:
    setPrice((old) => Number((old * 0.995).toFixed(6)));
  }

  // Reset simulation
  function resetSim() {
    if (!confirm("Reset local simulation state?")) return;
    setTokens(0);
    setSupply(0);
    setCash(0);
    setPrice(BASE_PRICE);
    setClouds(null);
    setWeatherDesc("");
    setLog([]);
    writeLS(null);
    pushLog("Simulation reset");
  }

  // quick auto-simulate helper (mint + maybe burn)
  function quickDemo() {
    fetchWeather().then(() => {
      setTimeout(() => {
        simulateProduction();
        setTimeout(() => {
          // random usage event burn small amount if tokens exist
          const toBurn = Math.min( Math.round(Math.random() * 40), tokens || 0 );
          if (toBurn > 0) useEnergy(toBurn);
        }, 700);
      }, 700);
    });
  }

  return (
    <main style={{ maxWidth: 980, margin: "28px auto", fontFamily: "Inter, ui-sans-serif" }}>
      <h1>SolarToken — Offline Simulation (no MetaMask)</h1>
      <p style={{ color: "#666" }}>Demo mode: simulated token economy. Use this if testnet/wallets are blocked.</p>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Wallet</div>
          <div style={{ fontSize: 18, marginTop: 8 }}>{addrLabel}</div>
          <div style={{ marginTop: 8 }}>Tokens: <b>{tokens} SLR</b></div>
          <div>Cash (sim): <b>${cash.toFixed(2)}</b></div>
        </div>

        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Market (internal)</div>
          <div style={{ fontSize: 18, marginTop: 8 }}>{price.toFixed(3)} u</div>
          <div style={{ marginTop: 8 }}>Total Supply: <b>{supply} SLR</b></div>
        </div>

        <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Weather</div>
          <div style={{ marginTop: 8 }}>
            <input value={lat} onChange={(e)=>setLat(e.target.value)} style={{width:120, marginRight:8, padding:6}} />
            <input value={lon} onChange={(e)=>setLon(e.target.value)} style={{width:120, padding:6}} />
            <button onClick={fetchWeather} style={{marginLeft:8, padding:"6px 10px"}}>Get Weather</button>
          </div>
          <div style={{ marginTop: 8 }}>Clouds: <b>{clouds ?? "—"}%</b></div>
          <div>Desc: <b>{weatherDesc || "—"}</b></div>
          <div>Mint Factor: <b>{factorText}</b></div>
        </div>
      </section>

      <section style={{ marginTop: 18, padding: 12, border: "1px solid #eee", borderRadius: 10 }}>
        <h3>Actions</h3>
        <div style={{ display: "flex", gap: 12, alignItems:"center" }}>
          <button onClick={simulateProduction} style={{ padding: "8px 12px" }}>☀️ Simulate Production (mint)</button>
          <button onClick={()=>useEnergy(20)} style={{ padding: "8px 12px" }}>⚡ Use 20 SLR (burn)</button>
          <div style={{ display: "flex", alignItems:"center", gap:8 }}>
  <input
    type="number"
    min="1"
    placeholder="Amount to sell"
    id="sellAmount"
    style={{ width: 100, padding: "6px 8px" }}
  />
  <button
    onClick={()=>{
      const val = Number((document.getElementById("sellAmount") as HTMLInputElement).value)
      sellExcess(val)
    }}
    style={{ padding: "8px 12px" }}
  >
    💸 Sell SLR (custom)
  </button>
</div>

          <button onClick={quickDemo} style={{ padding: "8px 12px" }}>🎛 Quick Demo</button>
          <button onClick={resetSim} style={{ marginLeft: "auto", padding: "8px 12px", background:"#fee" }}>Reset</button>
        </div>

        <p style={{ marginTop: 8, color:"#666" }}>
          Conversions: <code>1 kWh → {TOKEN_PER_KWH} SLR</code>. Price moves inversely with minted amount and increases on burns.
          If you have an OpenWeather key in <code>.env.local</code> (NEXT_PUBLIC_OPENWEATHER_API_KEY), real clouds% will be used — otherwise weather is simulated.
        </p>
      </section>

      <section style={{ marginTop: 18, display:"flex", gap:12 }}>
        <div style={{ flex:1, border:"1px solid #eee", borderRadius:10, padding:12 }}>
          <h4>Activity Log</h4>
          <div style={{ maxHeight:220, overflow:"auto", fontSize:13 }}>
            {log.length === 0 ? <i>No activity yet.</i> : log.map((l,i)=> <div key={i} style={{padding:"6px 0", borderBottom:"1px dashed #f0f0f0"}}>{l}</div>)}
          </div>
        </div>

        <div style={{ width:360, border:"1px solid #eee", borderRadius:10, padding:12 }}>
          <h4>Demo Controls</h4>
          <div style={{ marginTop:8 }}>
            <label>Mint amount preview (if simulate now):</label>
            <div style={{ marginTop:6 }}>
              <code>
                Example: if clouds = {clouds ?? "—"}, mint factor = {factorBps/100}x → 1kWh → {TOKEN_PER_KWH} SLR → minted ≈ {Math.round(TOKEN_PER_KWH * ( (factorBps)/10000 ) )} SLR per kWh
              </code>
            </div>
          </div>
          <div style={{ marginTop:12 }}>
            <small style={{ color:"#666" }}>Tip: run Quick Demo to automatically fetch weather, mint, and simulate a burn so you can show the judges an animated sequence quickly.</small>
          </div>
        </div>
      </section>
    </main>
  );
}
