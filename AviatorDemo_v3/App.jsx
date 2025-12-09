import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import CrashCanvas from './CrashCanvas';
import './theme.css';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';
const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function App(){
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [token, setToken] = useState(localStorage.getItem('token')||'');
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [socket, setSocket] = useState(null);
  const [roundHash, setRoundHash] = useState('');
  const [multiplier, setMultiplier] = useState(1.0);
  const [messages, setMessages] = useState([]);
  const [betAmount, setBetAmount] = useState(10);
  const [betId, setBetId] = useState(null);
  const [players, setPlayers] = useState([]);
  const [publicBets, setPublicBets] = useState([]);
  const [history, setHistory] = useState([]);
  const [promo, setPromo] = useState('');
  const [refCode, setRefCode] = useState(localStorage.getItem('ref')||'');

  useEffect(()=>{
    if(token){
      axios.get(API + '/api/wallet', { headers: { Authorization: 'Bearer ' + token } }).then(r=> setWallet(r.data.wallet)).catch(()=>{});
      // fetch transaction history (bets)
      axios.get(API + '/api/user/bets', { headers: { Authorization: 'Bearer ' + token } }).then(r=> setHistory(r.data.bets)).catch(()=>{});
    }
  }, [token]);

  useEffect(()=>{
    const s = io(SOCKET_URL);
    setSocket(s);
    s.on('round:new', (r)=>{ setRoundHash(r.hash); push('Round started — hash: '+ r.hash.slice(0,12)+'...'); setMultiplier(1.0); setBetId(null); });
    s.on('round:tick', (t)=> setMultiplier(t.multiplier));
    s.on('round:crash', (c)=> push('Round crashed at '+c.multiplier+'x — secret: '+c.secret.slice(0,12)+'...'));
    s.on('bet:accepted', (d)=> { push('Bet accepted id:'+d.betId); setBetId(d.betId); });
    s.on('bet:rejected', (d)=> push('Bet rejected: '+JSON.stringify(d)));
    s.on('cashout:ok', (d)=> push('Cashed out: '+d.payout+' at '+d.multiplier+'x'));
    // simulate incoming public bets & players list for demo
    s.on('public_bet', (p)=> setPublicBets(prev=>[p,...prev].slice(0,30)));
    s.on('players_update', (pl)=> setPlayers(pl));
    return ()=> s.disconnect();
  }, []);

  function push(t){ setMessages(m=>[t,...m].slice(0,12)); }

  async function requestOtp(){
    try{ await axios.post(API + '/api/auth/request-otp', { mobile }); push('OTP requested (check server logs in demo)'); }
    catch(e){ push('Error requesting OTP'); }
  }
  async function verifyOtp(){
    try{ const r = await axios.post(API + '/api/auth/verify-otp', { mobile, otp }); setToken(r.data.token); localStorage.setItem('token', r.data.token); setUser(r.data.user); push('Logged in'); }
    catch(e){ push('OTP verify failed'); }
  }

  async function deposit(){
    const amt = parseFloat(prompt('Deposit amount INR')); if(!amt) return;
    await axios.post(API + '/api/wallet/deposit', { amount: amt }, { headers: { Authorization: 'Bearer ' + token } });
    const r = await axios.get(API + '/api/wallet', { headers: { Authorization: 'Bearer ' + token } }); setWallet(r.data.wallet); push('Deposited '+amt);
  }

  function placeBet(){
    if(!socket || !token) return alert('Login first');
    socket.emit('place_bet', { token, roundId: Date.now(), amount: betAmount, ref: refCode });
    // emit public bet event for demo visualization
    socket.emit('public_bet', { user:'you', amount: betAmount });
  }

  function cashout(){
    if(!socket || !token || !betId) return alert('No bet');
    socket.emit('cashout', { token, betId });
  }

  async function redeemPromo(){
    if(!promo) return alert('Enter promo code');
    await axios.post(API + '/api/promo/redeem', { code: promo }, { headers: { Authorization: 'Bearer ' + token } });
    const r = await axios.get(API + '/api/wallet', { headers: { Authorization: 'Bearer ' + token } }); setWallet(r.data.wallet);
    push('Promo redeemed (if valid)');
  }

  async function requestWithdraw(){
    const amt = parseFloat(prompt('Withdraw amount INR')); if(!amt) return;
    await axios.post(API + '/api/wallet/withdraw/request', { amount: amt }, { headers: { Authorization: 'Bearer ' + token } });
    const r = await axios.get(API + '/api/wallet', { headers: { Authorization: 'Bearer ' + token } }); setWallet(r.data.wallet);
    push('Withdraw requested');
  }

  return (<div style={{padding:18}}>
    <div className='header'>
      <div className='logo app-card'><img src='/icon.png' alt='logo' style={{width:36}}/></div>
      <div>
        <div style={{fontSize:18, fontWeight:700}}>AViATOR</div>
        <div className='small'>Spribe Red Theme · INR</div>
      </div>
      <div style={{marginLeft:'auto'}} className='flex'>
        {token ? (<div className='badge small'>Logged: {user && user.mobile}</div>) : (<div className='badge small'>Not logged</div>)}
        <div className='badge small'>Players: {players.length}</div>
      </div>
    </div>

    <div style={{height:18}}/>

    <div className='card-grid'>
      <div>
        <div className='app-card'>
          <CrashCanvas multiplier={multiplier}/>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8}}>
            <div><div className='small'>Round hash</div><div style={{fontFamily:'monospace'}}>{roundHash.slice(0,16)}...</div></div>
            <div style={{textAlign:'right'}}><div className='small'>Multiplier</div><div style={{fontSize:30, fontWeight:800}}>{multiplier}x</div></div>
          </div>
          <div style={{marginTop:10, display:'flex', gap:8}}>
            <input type='number' value={betAmount} onChange={e=>setBetAmount(Number(e.target.value))} style={{width:120, padding:8, borderRadius:8}}/>
            <button className='btn' onClick={placeBet}>Place Bet</button>
            <button className='btn' onClick={cashout}>Cash Out</button>
            <div style={{marginLeft:'auto'}}><input placeholder='Referral code' value={refCode} onChange={e=>{setRefCode(e.target.value); localStorage.setItem('ref', e.target.value);}} style={{padding:6, borderRadius:8}}/></div>
          </div>
          <div style={{marginTop:10, display:'flex', gap:8, alignItems:'center'}}>
            <input placeholder='Promo code' value={promo} onChange={e=>setPromo(e.target.value)} style={{padding:6, borderRadius:8}}/>
            <button className='btn' onClick={redeemPromo}>Redeem</button>
            <div style={{marginLeft:'auto'}} className='small'>Referral bonus: 5%</div>
          </div>
        </div>

        <div style={{height:12}}/>

        <div className='app-card'>
          <h4>Transaction History</h4>
          <div className='history-list'>
            {history && history.length ? history.map(h=>(<div key={h.id} style={{padding:8, borderBottom:'1px solid rgba(255,255,255,0.03)'}}><div style={{fontSize:13}}>{h.created_at} — {h.status} — {h.amount}</div></div>)) : <div className='small'>No transactions yet</div>}
          </div>
        </div>
      </div>

      <div>
        <div className='app-card'>
          <h4>Players Live</h4>
          <div className='history-list'>
            {players.map((p,i)=>(<div key={i} style={{padding:8, borderBottom:'1px solid rgba(255,255,255,0.03)'}}>{p}</div>))}
          </div>
        </div>

        <div style={{height:12}}/>

        <div className='app-card'>
          <h4>Public Bets</h4>
          <div className='history-list'>
            {publicBets.map((b,i)=>(<div key={i} style={{display:'flex', justifyContent:'space-between', padding:8, borderBottom:'1px solid rgba(255,255,255,0.03)'}}><div>{b.user}</div><div>{b.amount} INR</div></div>))}
          </div>
        </div>

        <div style={{height:12}}/>

        <div className='app-card'>
          <h4>Admin / Quick Actions</h4>
          <div style={{display:'flex', gap:8}}>
            <button className='btn' onClick={deposit}>Deposit</button>
            <button className='btn' onClick={requestWithdraw}>Withdraw</button>
          </div>
          <div style={{marginTop:8}} className='small'>Go to Admin link below to manage promos & referrals.</div>
        </div>
      </div>
    </div>

    <div style={{height:20}}/>

    <div className='app-card' style={{marginTop:12}}>
      <div style={{display:'flex', justifyContent:'space-between'}}>
        <div><strong>Messages</strong></div>
        <div className='small'>Live</div>
      </div>
      <div style={{marginTop:8}} className='history-list'>{messages.map((m,i)=>(<div key={i} style={{padding:6}}>{m}</div>))}</div>
    </div>

    <div id='admin-area' style={{marginTop:24}}></div>
  </div>);
}