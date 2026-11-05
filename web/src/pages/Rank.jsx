import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { Avatar, BottomNav, Empty, Header, LevelBadge, Spinner } from '../components/ui.jsx';

export default function Rank() {
  const [type, setType] = useState('hosts');
  const [period, setPeriod] = useState('day');
  const [scope, setScope] = useState('world');
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); api(`/rank?type=${type}&period=${period}&scope=${scope}`).then(setRows).catch(() => setRows([])); }, [type, period, scope]);
  const top3 = rows?.slice(0, 3) || [];
  return (
    <div className="page with-nav">
      <Header title="Leaderboard" back={false} />
      <div className="seg"><button className={type === 'hosts' ? 'on' : ''} onClick={() => setType('hosts')}>Top hosts</button><button className={type === 'gifters' ? 'on' : ''} onClick={() => setType('gifters')}>Top gifters</button></div>
      <div className="seg small"><button className={scope === 'world' ? 'on' : ''} onClick={() => setScope('world')}>🌍 World</button><button className={scope === 'country' ? 'on' : ''} onClick={() => setScope('country')}>📍 My country</button></div>
      <div className="tabs">{[['day', 'Today'], ['week', 'Week'], ['month', 'Month']].map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="trophy" text="No gifts yet in this period" /> : (
        <>
          <div className="podium">
            {[1, 0, 2].map((i) => top3[i] && (
              <Link key={i} to={`/user/${top3[i].user.id}`} className={`pod p${i + 1}`}>
                <Avatar user={top3[i].user} size={i === 0 ? 76 : 60} />
                <b>{top3[i].user.name}</b><span>{fmt(top3[i].score)}</span><i>{i + 1}</i>
              </Link>
            ))}
          </div>
          <div className="list">{rows.slice(3).map((r, i) => (
            <Link key={r.user.id} to={`/user/${r.user.id}`} className="list-row"><span className="rank-no">{i + 4}</span><Avatar user={r.user} size={40} /><div className="grow"><b>{r.user.name}</b><LevelBadge level={type === 'hosts' ? r.user.hostLevel : r.user.level} vip={r.user.vip} /></div><span className="coins">{fmt(r.score)}</span></Link>
          ))}</div>
        </>
      )}
      <BottomNav />
    </div>
  );
}
