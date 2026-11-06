import { useEffect, useRef, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, Empty, Icon, Sheet } from '../components/ui.jsx';
import { useOpponentVideo } from './useLiveKit.js';

export function useCountdown(endsAt) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!endsAt) return undefined;
    // ends_at arrives as an ISO timestamp string from the API
    const endMs = typeof endsAt === 'number' ? endsAt : Date.parse(endsAt);
    if (!Number.isFinite(endMs)) return undefined;
    const tick = () => setLeft(Math.max(0, Math.round((endMs - Date.now()) / 1000)));
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, [endsAt]);
  return left;
}

// Score bar shown at the top of a PK battle. "mine" is the side of the room being watched.
export function PkBar({ pk, roomId }) {
  const left = useCountdown(pk.ends_at);
  const mineA = pk.room_a === roomId;
  const my = Number(mineA ? pk.score_a : pk.score_b);
  const their = Number(mineA ? pk.score_b : pk.score_a);
  const pct = my + their === 0 ? 50 : Math.min(90, Math.max(10, (my / (my + their)) * 100));
  return (
    <div className="pk-bar">
      <div className="pk-scores">
        <div className="pk-fill mine" style={{ width: `${pct}%` }}><span>{fmt(my)}</span></div>
        <div className="pk-fill theirs" style={{ width: `${100 - pct}%` }}><span>{fmt(their)}</span></div>
        <div className="pk-vs">VS</div>
      </div>
      <div className="pk-timer">{pk.status === 'active' ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Result'}</div>
    </div>
  );
}

// Right half of the screen during a PK: the opponent's live video.
export function PkOpponent({ pk, roomId, opponent, livekitUrl }) {
  const oppEl = useRef(null);
  const info = useOpponentVideo(pk, roomId, livekitUrl, oppEl);
  return (
    <div className="pk-opponent">
      <div ref={oppEl} className="stage-video-box" />
      {!info.live && (
        <div className="stage-cover"><img src={opponent?.avatar || '/icon.svg'} alt="" /><span>Connecting…</span></div>
      )}
      {opponent && <div className="pk-opp-name"><Avatar user={opponent} size={22} frame={false} />{opponent.name}</div>}
    </div>
  );
}

export function PkResult({ result, meHostId, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 4500); return () => clearTimeout(t); }, [onDone]);
  const draw = result.winner === 'draw';
  const won = result.winner === meHostId;
  return (
    <div className={`pk-result ${draw ? 'draw' : won ? 'win' : 'lose'}`}>
      <div className="pk-result-word">{draw ? 'DRAW' : won ? 'WIN' : 'LOSE'}</div>
      <div className="pk-result-score">{fmt(result.score_a)} : {fmt(result.score_b)}</div>
    </div>
  );
}

export function PkInviteSheet({ open, onClose, roomId }) {
  const { toast } = useApp();
  const [list, setList] = useState(null);
  const [waiting, setWaiting] = useState(false);
  useEffect(() => { if (open) api('/pk/candidates').then(setList).catch(() => setList([])); }, [open]);
  const invite = async (target) => {
    try { await api('/pk/invite', { method: 'POST', body: { room_id: target.id } }); toast(`Invite sent to ${target.name}`); onClose(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const random = async () => {
    setWaiting(true);
    try {
      const r = await api('/pk/random', { method: 'POST', body: { roomId } });
      if (!r.matched) toast('Looking for an opponent… try again in a few seconds');
      else onClose();
    } catch (e) { toast(e.message, 'error'); }
    setWaiting(false);
  };
  return (
    <Sheet open={open} onClose={onClose} title="PK Battle">
      <button className="btn primary block" onClick={random} disabled={waiting}><Icon name="vs" /> Random match</button>
      <p className="muted small">Or invite a host who is live now:</p>
      <div className="list">
        {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <Empty text="No other hosts live right now" /> : list.map((r) => (
          <div key={r.id} className="list-row">
            <Avatar user={{ name: r.name, avatar_url: r.avatar_url }} size={40} />
            <div className="grow"><b>{r.name}</b><small>{r.title || 'Live now'}</small></div>
            <button className="btn small" onClick={() => invite(r)}>Invite</button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function PkInviteModal({ invite, onClose }) {
  const { toast } = useApp();
  if (!invite) return null;
  const act = async (a) => {
    try { await api(`/pk/${invite.pk_id}/${a}`, { method: 'POST' }); }
    catch (e) { toast(e.message, 'error'); }
    onClose();
  };
  return (
    <div className="modal-wrap">
      <div className="modal">
        <Avatar user={invite.from} size={64} />
        <h3>{invite.from.name} wants a PK battle</h3>
        <p className="muted">5 minutes. The host with more gift points wins.</p>
        <div className="row gap">
          <button className="btn ghost" onClick={() => act('decline')}>Decline</button>
          <button className="btn primary" onClick={() => act('accept')}>Accept</button>
        </div>
      </div>
    </div>
  );
}
