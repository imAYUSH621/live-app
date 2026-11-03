import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Room, RoomEvent, Track } from 'livekit-client';
import { io } from 'socket.io-client';
import { get, post, num, dt, media, session, API_URL } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, UserCell, Modal, Tabs, useToast, confirmAct } from '../ui.jsx';

export default function Live() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('now');
  const [flagged, setFlagged] = useState(!!params.get('flagged'));
  const { data, reload } = useLoad(`/admin/live${flagged ? '?flagged=1' : ''}`, [flagged]);
  const [watch, setWatch] = useState(null);
  const toast = useToast();

  useEffect(() => {
    const i = setInterval(reload, 15000);
    const s = io(API_URL || undefined, { auth: { token: session.get()?.token }, transports: ['websocket', 'polling'] });
    s.on('admin:flag', (e) => { toast(`⚠️ Live #${e.room_id} auto-flagged: ${e.reason}`, 'error'); reload(); });
    return () => { clearInterval(i); s.close(); };
  }, [reload, toast]);

  return (
    <>
      <div className="head"><h1>Live monitoring</h1><button className="btn" onClick={reload}>Refresh</button></div>
      <Tabs value={tab} onChange={setTab} tabs={[['now', `Live now (${data?.length ?? 0})`], ['pk', 'PK battles'], ['calls', '1v1 calls'], ['history', 'Past lives']]} />
      {tab === 'now' && (
        <>
          <label className="check" style={{ marginBottom: 12 }}><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> Show flagged only</label>
          {!data ? <p className="muted">Loading…</p> : data.length === 0 ? <p className="empty card">No one is live right now.</p> : (
            <div className="live-grid">
              {data.map((r) => (
                <button key={r.id} className={`live-tile ${r.flagged ? 'flagged' : ''}`} onClick={() => setWatch(r)} style={{ textAlign: 'left', padding: 0 }}>
                  <div className="thumb" style={{ backgroundImage: r.thumbnail_url ? `url(${media(r.thumbnail_url)})` : r.host_avatar ? `url(${media(r.host_avatar)})` : undefined }}>
                    <span className="tag">{r.flagged ? <Badge v="flagged" kind="red" /> : <Badge v={r.type} kind="" />}</span>
                  </div>
                  <div className="meta">
                    <b className="ellipsis" style={{ display: 'block' }}>{r.host_name}</b>
                    <div className="muted small ellipsis">ID {r.uid} · 👁 {r.viewers} · 💎 {num(r.diamonds)}</div>
                    <div className="muted small ellipsis">{r.agency_name || 'no agency'} · {r.open_reports ? `🚩 ${r.open_reports}` : 'no reports'}</div>
                    <div className="muted small">thumb {r.thumb_at ? dt(r.thumb_at) : '—'}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {tab === 'pk' && <PkList />}
      {tab === 'calls' && <Calls />}
      {tab === 'history' && <History />}
      <WatchModal room={watch} onClose={() => { setWatch(null); reload(); }} />
    </>
  );
}

function WatchModal({ room, onClose }) {
  const act = useAct();
  const videoRef = useRef(null);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!room) return undefined;
    let lk;
    setErr(null);
    (async () => {
      const w = await get(`/admin/live/${room.id}/watch`);
      setInfo(w);
      lk = new Room();
      const attach = () => {
        const host = lk.remoteParticipants.get(String(room.host_id));
        const pub = host?.getTrackPublication(Track.Source.ScreenShare) || host?.getTrackPublication(Track.Source.Camera);
        if (pub?.track && videoRef.current) pub.track.attach(videoRef.current);
        const mic = host?.getTrackPublication(Track.Source.Microphone);
        if (mic?.track) mic.track.attach();
      };
      lk.on(RoomEvent.TrackSubscribed, attach);
      await lk.connect(w.livekit_url, w.token);
      attach();
    })().catch((e) => setErr(e.message));
    return () => lk?.disconnect();
  }, [room]);
  if (!room) return null;
  const done = async (fn, m) => { await act(fn, m); onClose(); };
  return (
    <Modal open onClose={onClose} title={`${room.host_name} · live #${room.id}`} wide>
      <div className="grid g2">
        <div>
          <div className="watch">
            <video ref={videoRef} autoPlay playsInline />
            {err && <p style={{ position: 'absolute', top: '45%', width: '100%', textAlign: 'center', color: '#fff' }}>Video unavailable: {err}</p>}
          </div>
          <p className="muted small" style={{ marginTop: 6 }}>You watch invisibly — the host and viewers can't see you.</p>
        </div>
        <div>
          <dl className="kv">
            <dt>Title</dt><dd>{room.title}</dd><dt>Type</dt><dd>{room.type} · {room.privacy}</dd>
            <dt>Started</dt><dd>{dt(room.started_at)}</dd><dt>Viewers</dt><dd>{room.viewers} (peak {room.peak_viewers})</dd>
            <dt>Diamonds</dt><dd>{num(room.diamonds)}</dd><dt>Agency</dt><dd>{room.agency_name || '—'}</dd>
            <dt>Reports</dt><dd>{room.open_reports}</dd><dt>Seats</dt><dd>{info?.seats?.filter((s) => s.user_id).length ?? 0} occupied</dd>
          </dl>
          {room.thumbnail_url && <img src={media(room.thumbnail_url)} alt="latest frame" style={{ width: 120, borderRadius: 8, marginTop: 8 }} />}
          <div className="row mt">
            <button className="btn gold" onClick={() => { const m = window.prompt('Warning shown on the host screen', 'Please follow community rules or your live will be stopped.'); if (m) done(() => post(`/admin/live/${room.id}/warn`, { message: m }), 'Warning sent'); }}>Warn host</button>
            <button className="btn danger" onClick={() => { const reason = window.prompt('Reason for stopping'); if (!reason) return; const hrs = window.prompt('Block going live for how many hours? (0 = no block)', '24'); done(() => post(`/admin/live/${room.id}/cut`, { reason, ban_hours: Number(hrs || 0) }), 'Live stopped'); }}>Stop live</button>
            {room.flagged && <button className="btn ok" onClick={() => done(() => post(`/admin/live/${room.id}/unflag`), 'Marked safe')}>Mark safe</button>}
            <button className="btn" onClick={() => done(() => post(`/admin/live/${room.id}/edit`, { clear_title: true, clear_cover: true }), 'Title/cover cleared')}>Clear title & cover</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PkList() {
  const { data, reload } = useLoad('/admin/pk');
  const act = useAct();
  return <Table rows={data} columns={[
    { key: 'id', label: '#' }, { label: 'Side A', render: (r) => <UserCell u={r.a} /> }, { label: 'Score', render: (r) => `${num(r.score_a)} : ${num(r.score_b)}` },
    { label: 'Side B', render: (r) => <UserCell u={r.b} /> }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'Started', render: (r) => dt(r.started_at) },
    { label: '', render: (r) => r.status === 'active' && <button className="btn sm danger" onClick={async () => { await act(() => post(`/admin/pk/${r.id}/stop`), 'PK stopped'); reload(); }}>Stop</button> },
  ]} />;
}

function Calls() {
  const [active, setActive] = useState(true);
  const { data, reload } = useLoad(`/admin/calls${active ? '?active=1' : ''}`, [active]);
  const act = useAct();
  return (
    <>
      <label className="check" style={{ marginBottom: 12 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active only</label>
      <Table rows={data} columns={[
        { key: 'id', label: '#' }, { label: 'Caller', render: (r) => <UserCell u={r.caller} /> }, { label: 'Host', render: (r) => <UserCell u={r.host} /> },
        { label: 'Type', render: (r) => `${r.kind} · ${r.mode}` }, { label: 'Rate', render: (r) => `${r.rate}/min` }, { label: 'Duration', render: (r) => `${Math.round(r.seconds / 60)} min` },
        { label: 'Coins', right: true, render: (r) => num(r.coins) }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'When', render: (r) => dt(r.created_at) },
        { label: '', render: (r) => r.status === 'active' && <button className="btn sm danger" onClick={async () => { if (confirmAct('End this call?')) { await act(() => post(`/admin/calls/${r.id}/end`), 'Call ended'); reload(); } }}>End</button> },
      ]} />
    </>
  );
}

function History() {
  const { data } = useLoad('/admin/live/history?limit=100');
  return <Table rows={data} columns={[
    { key: 'id', label: '#' }, { label: 'Host', render: (r) => `${r.host_name} (${r.uid})` }, { key: 'type', label: 'Type' }, { key: 'title', label: 'Title' },
    { label: 'Duration', render: (r) => (r.ended_at ? `${Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000)} min` : '—') },
    { label: 'Viewers', right: true, render: (r) => num(r.total_viewers) }, { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) },
    { label: 'Ended by', render: (r) => <Badge v={r.end_reason} kind={r.end_reason === 'admin_cut' ? 'red' : ''} /> }, { label: 'Started', render: (r) => dt(r.started_at) },
  ]} />;
}
