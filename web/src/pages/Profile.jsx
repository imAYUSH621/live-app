import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, Header, Icon, LevelBadge, Sheet, Spinner } from '../components/ui.jsx';

export default function Profile() {
  const { id: raw } = useParams();
  const { me, toast } = useApp();
  const [params] = useSearchParams();
  const id = raw === 'me' ? me?.user?.id : raw;
  const [d, setD] = useState(null);
  const [list, setList] = useState(null);
  const [report, setReport] = useState(false);
  const nav = useNavigate();
  const mine = id === me?.user?.id;

  useEffect(() => { if (id) api(`/users/${id}`).then(setD).catch((e) => toast(e.message, 'error')); }, [id, toast]);
  useEffect(() => {
    const t = params.get('tab');
    if (mine && t) api(`/me/follows?type=${t}`).then((l) => setList({ title: t === 'followers' ? 'Fans' : 'Following', l })).catch(() => {});
  }, [mine, params]);

  if (!d) return <div className="page"><Header title="" /><Spinner /></div>;
  const u = d.user;
  const follow = async () => {
    try { await api(`/users/${u.id}/follow`, { method: d.isFollowing ? 'DELETE' : 'POST' }); setD({ ...d, isFollowing: !d.isFollowing, followers: d.followers + (d.isFollowing ? -1 : 1) }); }
    catch (e) { toast(e.message, 'error'); }
  };
  const sendReport = async (reason) => {
    try { await api('/report', { method: 'POST', body: { targetType: 'user', targetId: u.id, reason } }); toast('Reported. Thank you.'); } catch (e) { toast(e.message, 'error'); }
    setReport(false);
  };

  return (
    <div className="page">
      <Header title="" right={!mine && <button className="icon-btn" onClick={() => setReport(true)} aria-label="Report"><Icon name="flag" /></button>} />
      <div className="profile-head">
        <Avatar user={u} size={96} />
        <h2>{u.name}</h2>
        <p className="muted">ID {u.publicId}</p>
        <LevelBadge level={u.isHost ? u.hostLevel : u.level} vip={u.vip} />
        {u.bio && <p>{u.bio}</p>}
        <div className="me-stats"><div><b>{fmt(d.followers)}</b><span>Fans</span></div><div><b>{fmt(d.following)}</b><span>Following</span></div></div>
        {d.live && <button className="btn primary" onClick={() => nav(`/live/${d.live.id}`)}>● Live now: watch</button>}
        {!mine && (
          <div className="row gap center">
            <button className={`btn ${d.isFollowing ? '' : 'primary'}`} onClick={follow}>{d.isFollowing ? 'Following' : 'Follow'}</button>
            <Link className="btn" to={`/chat/${u.id}`}>Message</Link>
          </div>
        )}
      </div>
      {d.giftWall.length > 0 && <>
        <h3 className="section-title">Gift wall</h3>
        <div className="gift-wall">{d.giftWall.map((g) => <div key={g.id}><img src={g.icon} alt="" /><span>x{fmt(g.qty)}</span></div>)}</div>
      </>}
      <Sheet open={!!list} onClose={() => { setList(null); nav(-1); }} title={list?.title}>
        <div className="list">{list?.l.map((x) => <Link key={x.id} to={`/user/${x.id}`} className="list-row"><Avatar user={x} size={40} /><div className="grow"><b>{x.name}</b></div></Link>)}</div>
      </Sheet>
      <Sheet open={report} onClose={() => setReport(false)} title="Report user">
        {['Fake profile', 'Nudity or sexual content', 'Harassment', 'Underage user', 'Scam'].map((r) => <button key={r} className="menu-row" onClick={() => sendReport(r)}>{r}</button>)}
      </Sheet>
    </div>
  );
}
