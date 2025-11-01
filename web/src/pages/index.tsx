import { useEffect, useMemo, useState } from 'react'
import { CONTRACT_ADDRESS, ABI } from '@/lib/contract'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { createPublicClient, createWalletClient, http, parseEther } from 'viem'
import { baseSepolia } from 'viem/chains'

type Offer = {
  seller: `0x${string}`;
  basePriceWeiPerKWh: bigint;
  availableKWh: bigint;
  active: boolean;
};

const RPC = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC!;
const OWM_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY!;
const DEF_LAT = Number(process.env.NEXT_PUBLIC_LAT ?? 37.8039);
const DEF_LON = Number(process.env.NEXT_PUBLIC_LON ?? -122.4011);

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC) });

export default function Home() {
  const { address } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()

  const [offerId, setOfferId] = useState<number>(0)
  const [sellerOffer, setSellerOffer] = useState<Offer | null>(null)

  // Create Offer inputs
  const [basePriceEthPerKWh, setBasePriceEthPerKWh] = useState('0.005')
  const [totalKWh, setTotalKWh] = useState('10')

  // Buy inputs
  const [buyOfferId, setBuyOfferId] = useState<number>(0)
  const [buyKWh, setBuyKWh] = useState('1')
  const [lat, setLat] = useState(DEF_LAT.toString())
  const [lon, setLon] = useState(DEF_LON.toString())
  const [cloudPct, setCloudPct] = useState<number | null>(null)
  const [weatherDesc, setWeatherDesc] = useState<string>('')

  // Derived factor: price factor based on clouds (0..100). 50% max discount.
  const weatherFactorBps = useMemo(() => {
    const clouds = cloudPct ?? 0
    // factor = 1 - 0.5 * (clouds/100) => 100% clouds -> 0.5x price
    const f = 1 - 0.5 * (clouds / 100)
    return Math.round(f * 10000)
  }, [cloudPct])

  const adjPriceEth = useMemo(() => {
    if (!sellerOffer) return '0'
    const baseWeiPerKWh = sellerOffer.basePriceWeiPerKWh
    const kwh = BigInt(Math.max(0, parseInt(buyKWh || '0')))
    const baseCost = baseWeiPerKWh * kwh
    const finalCostWei = (baseCost * BigInt(weatherFactorBps)) / BigInt(10000)
    const eth = Number(finalCostWei) / 1e18
    return eth.toFixed(6)
  }, [sellerOffer, buyKWh, weatherFactorBps])

  async function makeWalletClient() {
    return createWalletClient({ chain: baseSepolia, transport: http(RPC) })
  }

  async function fetchOffer(id: number) {
    try {
      const res = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: ABI,
        functionName: 'offers',
        args: [BigInt(id)]
      })
      const [seller, basePriceWeiPerKWh, availableKWh, active] = res as any
      setSellerOffer({ seller, basePriceWeiPerKWh, availableKWh, active })
    } catch {
      setSellerOffer(null)
    }
  }

  async function getWeather() {
    const la = parseFloat(lat), lo = parseFloat(lon)
    const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${la}&lon=${lo}&appid=${OWM_KEY}&units=metric`)
    const j = await resp.json()
    const clouds = j?.clouds?.all ?? 0
    const desc = j?.weather?.[0]?.description ?? 'n/a'
    setCloudPct(Number(clouds))
    setWeatherDesc(String(desc))
  }

  useEffect(() => {
    if (sellerOffer == null && offerId >= 0) fetchOffer(offerId)
  }, [offerId])

  return (
    <main style={{maxWidth:900, margin:'40px auto', fontFamily:'Inter, ui-sans-serif'}}>
      <h1>SolMate — Weather-Aware P2P Energy</h1>

      <section style={{border:'1px solid #eee', padding:16, borderRadius:12, marginBottom:24}}>
        {address ? (
          <>
            <div>Connected: <b>{address}</b></div>
            <button onClick={()=>disconnect()} style={{padding:8, marginTop:8}}>Disconnect</button>
          </>
        ) : (
          <button onClick={()=>connect({ connector: injected() })} style={{padding:10}}>Connect MetaMask</button>
        )}
      </section>

      <section style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
        {/* Seller panel */}
        <div style={{border:'1px solid #ddd', borderRadius:12, padding:16}}>
          <h2>Seller: Create Offer</h2>
          <label>Base Price (ETH per kWh)</label>
          <input value={basePriceEthPerKWh} onChange={e=>setBasePriceEthPerKWh(e.target.value)} style={{display:'block', padding:8, width:'100%', marginBottom:8}} />
          <label>Total kWh</label>
          <input value={totalKWh} onChange={e=>setTotalKWh(e.target.value)} style={{display:'block', padding:8, width:'100%', marginBottom:12}} />
          <button onClick={async ()=>{
            const client = await makeWalletClient()
            const weiPer = parseEther(basePriceEthPerKWh)
            const { request } = await client.prepareTransactionRequest({
              to: CONTRACT_ADDRESS,
              data: (await import('viem')).encodeFunctionData({
                abi: ABI, functionName:'createOffer',
                args:[weiPer, BigInt(parseInt(totalKWh))]
              })
            })
            const hash = await client.sendTransaction(request)
            alert('Offer created. Tx: ' + hash + '\nNow read nextOfferId-1 for the ID.')
            // read nextOfferId
            const nextId = await publicClient.readContract({
              address: CONTRACT_ADDRESS, abi: ABI, functionName:'nextOfferId', args:[]
            }) as bigint
            setOfferId(Number(nextId - 1n))
            setBuyOfferId(Number(nextId - 1n))
            await fetchOffer(Number(nextId - 1n))
          }} style={{padding:10}}>Create Offer</button>

          <hr style={{margin:'16px 0'}} />

          <h3>Check Offer</h3>
          <label>Offer ID</label>
          <input type="number" value={offerId} onChange={e=>setOfferId(parseInt(e.target.value))} style={{display:'block', padding:8, width:'100%'}} />
          <button onClick={()=>fetchOffer(offerId)} style={{padding:8, marginTop:8}}>Refresh</button>
          <div style={{marginTop:12, fontSize:14}}>
            {sellerOffer ? (
              <div>
                <div><b>Seller:</b> {sellerOffer.seller}</div>
                <div><b>Base Price (ETH/kWh):</b> {(Number(sellerOffer.basePriceWeiPerKWh)/1e18).toFixed(6)}</div>
                <div><b>Available kWh:</b> {sellerOffer.availableKWh.toString()}</div>
                <div><b>Active:</b> {sellerOffer.active ? 'Yes' : 'No'}</div>
              </div>
            ) : <i>No offer loaded yet.</i>}
          </div>
        </div>

        {/* Buyer panel */}
        <div style={{border:'1px solid #ddd', borderRadius:12, padding:16}}>
          <h2>Buyer: Weather-Aware Purchase</h2>
          <label>Offer ID</label>
          <input type="number" value={buyOfferId} onChange={e=>setBuyOfferId(parseInt(e.target.value))} style={{display:'block', padding:8, width:'100%', marginBottom:8}} />

          <label>kWh to buy</label>
          <input value={buyKWh} onChange={e=>setBuyKWh(e.target.value)} style={{display:'block', padding:8, width:'100%', marginBottom:8}} />

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div>
              <label>Latitude</label>
              <input value={lat} onChange={e=>setLat(e.target.value)} style={{display:'block', padding:8, width:'100%'}} />
            </div>
            <div>
              <label>Longitude</label>
              <input value={lon} onChange={e=>setLon(e.target.value)} style={{display:'block', padding:8, width:'100%'}} />
            </div>
          </div>
          <button onClick={getWeather} style={{padding:8, marginTop:8}}>Get Weather</button>

          <div style={{marginTop:10}}>
            <div><b>Cloud cover:</b> {cloudPct ?? '—'}%</div>
            <div><b>Weather:</b> {weatherDesc || '—'}</div>
            <div><b>Factor:</b> {weatherFactorBps/100}%</div>
          </div>

          <div style={{marginTop:10, padding:10, background:'#fafafa', borderRadius:8}}>
            <b>Adjusted Price:</b> ~{adjPriceEth} ETH
          </div>

          <button onClick={async ()=>{
            const kwh = BigInt(parseInt(buyKWh || '0'))
            if (!sellerOffer) { alert('Load offer first'); return; }
            if (cloudPct == null) { alert('Fetch weather first'); return; }

            const la = Math.round(parseFloat(lat) * 1e6);
            const lo = Math.round(parseFloat(lon) * 1e6);

            // recompute final price in wei (same math as UI)
            const baseWeiPerKWh = sellerOffer.basePriceWeiPerKWh
            const baseCost = baseWeiPerKWh * kwh
            const finalCostWei = (baseCost * BigInt(weatherFactorBps)) / BigInt(10000)

            const client = await makeWalletClient()
            const { request } = await client.prepareTransactionRequest({
              to: CONTRACT_ADDRESS,
              value: finalCostWei,
              data: (await import('viem')).encodeFunctionData({
                abi: ABI, functionName:'buyEnergy',
                args:[
                  BigInt(buyOfferId),
                  kwh,
                  BigInt(weatherFactorBps),
                  weatherDesc || 'n/a',
                  BigInt(la),
                  BigInt(lo),
                  BigInt(cloudPct!)
                ]
              })
            })
            const tx = await client.sendTransaction(request)
            alert('Purchased! Tx: ' + tx)
            // Refresh
            await fetchOffer(buyOfferId)
          }} style={{padding:10, marginTop:12}}>Buy Now</button>
        </div>
      </section>

      <p style={{marginTop:24, fontSize:13, color:'#666'}}>
        Pricing rule: <code>final = base × (1 − 0.5 × clouds%)</code> (min 0.5x at 100% clouds). Everything settles on-chain.
      </p>
    </main>
  )
}
