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
  const [wall, setWall] = useState([]);
  const [list, setList] = useState(null);
  const [report, setReport] = useState(false);
  const nav = useNavigate();
  const mine = String(id) === String(me?.user?.id);

  useEffect(() => {
    if (!id) return;
    api(`/users/${id}`).then(setD).catch((e) => toast(e.message, 'error'));
    api(`/users/${id}/giftwall`).then(setWall).catch(() => {});
  }, [id, toast]);
  useEffect(() => {
    const t = params.get('tab');
    if (mine && t) api(`/users/${id}/${t}`).then((l) => setList({ title: t === 'followers' ? 'Fans' : 'Following', l })).catch(() => {});
  }, [mine, params, id]);

  if (!d) return <div className="page"><Header title="" /><Spinner /></div>;
  const u = d.mini || d;
  const publicId = d.fancy_id || d.uid || u.uid;
  const isFollowing = !!d.following;
  const follow = async () => {
    try { await api(`/users/${id}/follow`, { method: isFollowing ? 'DELETE' : 'POST' }); setD({ ...d, following: !isFollowing, followers: d.followers + (isFollowing ? -1 : 1) }); }
    catch (e) { toast(e.message, 'error'); }
  };
  const sendReport = async (reason) => {
    try {
      const fd = new FormData();
      fd.append('target_type', 'user');
      fd.append('target_id', String(id));
      fd.append('reason', reason);
      await api('/reports', { method: 'POST', form: fd });
      toast('Reported. Thank you.');
    } catch (e) { toast(e.message, 'error'); }
    setReport(false);
  };

  return (
    <div className="page">
      <Header title="" right={!mine && <button className="icon-btn" onClick={() => setReport(true)} aria-label="Report"><Icon name="flag" /></button>} />
      <div className="profile-head">
        <Avatar user={u} size={96} />
        <h2>{u.name}</h2>
        <p className="muted">ID {publicId}</p>
        <LevelBadge level={d.is_host ? (d.host?.level ?? u.charm_level) : u.level} vip={u.vip} />
        {d.bio && <p>{d.bio}</p>}
        <div className="me-stats"><div><b>{fmt(d.followers)}</b><span>Fans</span></div><div><b>{fmt(d.following_count)}</b><span>Following</span></div></div>
        {d.live_room_id && <button className="btn primary" onClick={() => nav(`/live/${d.live_room_id}`)}>● Live now: watch</button>}
        {!mine && (
          <div className="row gap center">
            <button className={`btn ${isFollowing ? '' : 'primary'}`} onClick={follow}>{isFollowing ? 'Following' : 'Follow'}</button>
            <Link className="btn" to={`/chat/${id}`}>Message</Link>
            <Link className="btn" to={`/cp?to=${id}`}>CP proposal</Link>
          </div>
        )}
      </div>
      {wall.length > 0 && <>
        <h3 className="section-title">Gift wall</h3>
        <div className="gift-wall">{wall.map((g) => <div key={g.id}><img src={g.icon} alt="" /><span>x{fmt(g.count)}</span></div>)}</div>
      </>}
      <Sheet open={!!list} onClose={() => { setList(null); nav(-1); }} title={list?.title}>
        <div className="list">{(list?.l || []).map((x) => <Link key={x.id} to={`/user/${x.id}`} className="list-row"><Avatar user={x} size={40} /><div className="grow"><b>{x.name}</b></div></Link>)}</div>
      </Sheet>
      <Sheet open={report} onClose={() => setReport(false)} title="Report user">
        {['Fake profile', 'Nudity or sexual content', 'Harassment', 'Underage user', 'Scam'].map((r) => <button key={r} className="menu-row" onClick={() => sendReport(r)}>{r}</button>)}
      </Sheet>
    </div>
  );
}
