import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, Header, Sheet, Spinner } from '../components/ui.jsx';

export default function Couple() {
  const { me, config, wallet, refresh } = useApp();
  const [params] = useSearchParams();
  const targetId = params.get('to');
  const myId = me?.user?.id;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState('');
  const review = value => { setStatus(''); setError(''); setConfirm(value); };
  const price = Number(config.economy?.cp_coins);
  const enabled = config.features?.cp === true;
  const load = useCallback(async () => {
    if (!myId) return;
    try {
      const [profile, requests, target] = await Promise.all([
        api(`/users/${myId}`), api('/cp/requests'), targetId ? api(`/users/${targetId}`) : null,
      ]);
      setData({ profile, requests, target }); setError('');
    } catch (e) { setError(e.message); }
  }, [myId, targetId]);
  useEffect(() => { load(); setSent(false); setStatus(''); }, [load]);
  const act = async () => {
    if (!confirm || busy) return;
    setBusy(true); setStatus(''); setError('');
    try {
      if (confirm.kind === 'propose') {
        await api('/cp/propose', { method: 'POST', body: { user_id: Number(targetId), expected_coins: price } });
        setSent(true); setStatus('CP proposal sent');
      } else if (confirm.kind === 'end') {
        await api('/cp', { method: 'DELETE' }); setStatus('CP ended');
      } else {
        await api(`/cp/requests/${confirm.id}`, { method: 'POST', body: { accept: confirm.kind === 'accept' } });
        setStatus(confirm.kind === 'accept' ? 'CP accepted' : 'Proposal declined and sender refunded');
      }
      setConfirm(null); await Promise.all([load(), refresh()]);
    } catch (e) { await load(); setError(e.message); }
    finally { setBusy(false); }
  };
  const partner = data?.profile?.cp?.user;
  const target = data?.target?.mini || data?.target;
  const proposalDisabled = !enabled || sent || !!partner || !!data?.target?.cp || Number(targetId) === myId || !Number.isFinite(price) || wallet.coins < price;
  return <div className="page">
    <Header title="CP relationship" />
    {status && <p role="status" className="card">{status}</p>}
    <p className="muted">Both people must agree. A declined proposal returns its coins to the sender.</p>
    {error && <div role="alert" className="card"><p>{error}</p><button className="btn" onClick={load}>Retry</button></div>}
    {!data && !error && <Spinner />}
    {data && <>
      <section className="card"><h2>Your CP</h2>{partner ? <>
        <Link className="list-row" to={`/user/${partner.id}`}><Avatar user={partner} size={48}/><b>{partner.name}</b></Link>
        <button className="btn danger" onClick={() => review({kind:'end'})}>End CP</button>
      </> : <p>You do not have a CP partner.</p>}</section>
      {target && <section className="card"><h2>Send a proposal</h2><div className="row gap"><Avatar user={target} size={48}/><div><b>{target.name}</b><p className="muted">ID {target.fancy_id || target.uid}</p></div></div>
        <p>{Number.isFinite(price) ? `${price.toLocaleString('en-IN')} coins are charged when you send. If accepted, these coins are not refunded.` : 'Loading current proposal price...'}</p>
        {!enabled && <p role="status">CP proposals are currently disabled.</p>}
        {Number(targetId) === myId && <p>You cannot propose to yourself.</p>}
        {partner && <p>End your current CP before sending another proposal.</p>}
        {data.target.cp && <p>This person already has a CP.</p>}
        {wallet.coins < price && <p>You need {price.toLocaleString('en-IN')} coins. Current balance: {Number(wallet.coins).toLocaleString('en-IN')}.</p>}
        <button className="btn primary" disabled={proposalDisabled} onClick={() => review({kind:'propose'})}>{sent ? 'Proposal sent' : 'Review proposal'}</button>
      </section>}
      <section className="card"><h2>Incoming proposals</h2>{data.requests.length ? data.requests.map(r => <div key={r.id} style={{padding:'16px 0',borderBottom:'1px solid var(--line)'}}>
        <Link className="list-row" to={`/user/${r.from.id}`}><Avatar user={r.from} size={40}/><b>{r.from.name}</b></Link>
        <div className="row gap"><button className="btn primary" disabled={busy || !!partner} onClick={() => review({kind:'accept',id:r.id,name:r.from.name})}>Accept CP</button><button className="btn" disabled={busy} onClick={() => review({kind:'decline',id:r.id,name:r.from.name})}>Decline</button></div>
      </div>) : <p>No pending proposals.</p>}<button className="btn" disabled={busy} onClick={load}>Refresh proposals</button></section>
    </>}
    <Sheet className="cp-sheet" open={!!confirm} onClose={() => !busy && setConfirm(null)} title={confirm?.kind === 'propose' ? 'Confirm proposal' : confirm?.kind === 'end' ? 'End your CP?' : confirm?.kind === 'accept' ? 'Accept CP?' : 'Decline proposal?'}>
      {error && <p role="alert" style={{color:"#b91c1c"}}>{error}</p>}
      <p>{confirm?.kind === 'propose' ? `Send a CP proposal to ${target?.name} for ${price.toLocaleString('en-IN')} coins? The sender is refunded only if declined.` : confirm?.kind === 'end' ? 'This ends the relationship for both people. Proposal coins are not refunded.' : confirm?.kind === 'accept' ? `Become CP partners with ${confirm.name}?` : `Decline ${confirm?.name}'s proposal? Its coins will be returned to the sender.`}</p>
      <div className="row gap"><button className="btn" disabled={busy} onClick={() => setConfirm(null)}>Cancel</button><button className="btn primary" disabled={busy} onClick={act}>{busy ? 'Working...' : 'Confirm'}</button></div>
    </Sheet>
  </div>;
}
