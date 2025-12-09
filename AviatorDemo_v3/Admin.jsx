import React, {useState, useEffect} from 'react';
import axios from 'axios';

const API = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export default function Admin(){
  const [promoCode, setPromoCode] = useState(''); const [promoAmt, setPromoAmt] = useState(0); const [referrals, setReferrals] = useState([]);
  const [token, setToken] = useState('');
  const [username, setUsername] = useState('sahu');
  const [password, setPassword] = useState('5678');
  const [users, setUsers] = useState([]);
  const [bets, setBets] = useState([]);
  const [withdraws, setWithdraws] = useState([]);

  async function login(){
    try{
      const r = await axios.post(API + '/api/admin/login', { username, password });
      setToken(r.data.token);
      localStorage.setItem('admin_token', r.data.token);
    }catch(e){ alert('login failed'); }
  }

  async function fetchData(){
    try{ const ref = await axios.get(API + '/api/admin/referrals', { headers: { Authorization: 'Bearer ' + (token || localStorage.getItem('admin_token')) } }); setReferrals(ref.data.referrals || []); }catch(e){}
    const t = token || localStorage.getItem('admin_token');
    if(!t) return alert('login first');
    try{
      const u = await axios.get(API + '/api/admin/users', { headers: { Authorization: 'Bearer ' + t } });
      setUsers(u.data.users || []);
      const b = await axios.get(API + '/api/admin/bets', { headers: { Authorization: 'Bearer ' + t } });
      setBets(b.data.bets || []);
      const w = await axios.get(API + '/api/admin/withdraws', { headers: { Authorization: 'Bearer ' + t } });
      setWithdraws(w.data.withdraws || []);
    }catch(e){ console.error(e); alert('fetch error'); }
  }

  async function approveWithdraw(id){
    const t = token || localStorage.getItem('admin_token');
    await axios.post(API + '/api/admin/withdraws/approve', { id }, { headers: { Authorization: 'Bearer ' + t } });
    fetchData();
  }

  async function rejectWithdraw(id){
    const t = token || localStorage.getItem('admin_token');
    await axios.post(API + '/api/admin/withdraws/reject', { id }, { headers: { Authorization: 'Bearer ' + t } });
    fetchData();
  }

  return (<div style={{padding:16}}>
    <h3>Admin Panel</h3>
    {!localStorage.getItem('admin_token') && (<div>
      <input value={username} onChange={e=>setUsername(e.target.value)} /> <input value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={login}>Login</button>
    </div>)}
    <div style={{marginTop:12}}>
      <button onClick={fetchData}>Refresh Data</button>
    </div>
    <h4>Users</h4>
    <table border='1'><thead><tr><th>ID</th><th>Mobile</th></tr></thead><tbody>{users.map(u=>(<tr key={u.id}><td>{u.id}</td><td>{u.mobile}</td></tr>))}</tbody></table>
    <h4>Bets</h4>
    <table border='1'><thead><tr><th>ID</th><th>User</th><th>Round</th><th>Amount</th><th>Status</th></tr></thead><tbody>{bets.map(b=>(<tr key={b.id}><td>{b.id}</td><td>{b.user_id}</td><td>{b.round_id}</td><td>{b.amount}</td><td>{b.status}</td></tr>))}</tbody></table>
    <h4>Withdraw Requests</h4>
    <table border='1'><thead><tr><th>ID</th><th>User</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{withdraws.map(w=>(<tr key={w.id}><td>{w.id}</td><td>{w.user_id}</td><td>{w.amount}</td><td>{w.status}</td><td>{w.status==='pending' && (<span><button onClick={()=>approveWithdraw(w.id)}>Approve</button><button onClick={()=>rejectWithdraw(w.id)}>Reject</button></span>)}</td></tr>))}</tbody></table>
  
  async function createPromo(){
    const t = token || localStorage.getItem('admin_token');
    if(!t) return alert('login first');
    await axios.post(API + '/api/admin/promo', { code: promoCode, amount: promoAmt }, { headers: { Authorization: 'Bearer ' + t } });
    alert('promo created');
  }

  async function fetchReferrals(){ const t = token || localStorage.getItem('admin_token'); const r = await axios.get(API + '/api/admin/referrals', { headers: { Authorization: 'Bearer ' + t } }); setReferrals(r.data.referrals || []); }

  return (<div style={{padding:16}}>
    <h3>Admin Panel</h3>
    {!localStorage.getItem('admin_token') && (<div>
      <input value={username} onChange={e=>setUsername(e.target.value)} /> <input value={password} onChange={e=>setPassword(e.target.value)} />
      <button onClick={login}>Login</button>
    </div>)}
    <div style={{marginTop:12}}>
      <button onClick={fetchData}>Refresh Data</button> <button onClick={fetchReferrals}>Refresh Referrals</button>
    </div>
    <h4>Create Promo</h4>
    <div><input placeholder='code' value={promoCode} onChange={e=>setPromoCode(e.target.value)}/> <input placeholder='amount' type='number' value={promoAmt} onChange={e=>setPromoAmt(Number(e.target.value))}/> <button onClick={createPromo}>Create</button></div>
    <h4>Referrals</h4>
    <table border='1'><thead><tr><th>ID</th><th>Referrer</th><th>Referee</th><th>Amount</th></tr></thead><tbody>{referrals.map(r=>(<tr key={r.id}><td>{r.id}</td><td>{r.referrer_id}</td><td>{r.referee_id}</td><td>{r.amount}</td></tr>))}</tbody></table>
    <h4>Users</h4>
    <table border='1'><thead><tr><th>ID</th><th>Mobile</th></tr></thead><tbody>{users.map(u=>(<tr key={u.id}><td>{u.id}</td><td>{u.mobile}</td></tr>))}</tbody></table>
    <h4>Bets</h4>
    <table border='1'><thead><tr><th>ID</th><th>User</th><th>Round</th><th>Amount</th><th>Status</th></tr></thead><tbody>{bets.map(b=>(<tr key={b.id}><td>{b.id}</td><td>{b.user_id}</td><td>{b.round_id}</td><td>{b.amount}</td><td>{b.status}</td></tr>))}</tbody></table>
    <h4>Withdraw Requests</h4>
    <table border='1'><thead><tr><th>ID</th><th>User</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{withdraws.map(w=>(<tr key={w.id}><td>{w.id}</td><td>{w.user_id}</td><td>{w.amount}</td><td>{w.status}</td><td>{w.status==='pending' && (<span><button onClick={()=>approveWithdraw(w.id)}>Approve</button><button onClick={()=>rejectWithdraw(w.id)}>Reject</button></span>)}</td></tr>))}</tbody></table>
  </div>);
}