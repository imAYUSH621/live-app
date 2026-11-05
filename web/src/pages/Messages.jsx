import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, BottomNav, Empty, Header, Icon } from '../components/ui.jsx';

const ago = (t) => {
  const s = (Date.now() - Number(t)) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(Number(t)).toLocaleDateString('en-IN');
};

export default function Messages() {
  const { socket } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => {
    const load = () => api('/conversations').then(setList).catch(() => setList([]));
    load();
    socket?.on('dm', load);
    return () => socket?.off('dm', load);
  }, [socket]);
  return (
    <div className="page with-nav">
      <Header title="Chats" back={false} />
      {list && list.length === 0 && <Empty icon="chat" text="No messages yet. Say hi to a host from their profile." />}
      <div className="list">
        {(list || []).map((c) => (
          <Link key={c.user.id} to={`/chat/${c.user.id}`} className="list-row">
            <Avatar user={c.user} size={48} />
            <div className="grow"><b>{c.user.name}</b><small>{c.last.mine ? 'You: ' : ''}{c.last.body}</small></div>
            <div className="right"><small className="muted">{ago(c.last.at)}</small>{c.unread > 0 && <span className="unread">{c.unread}</span>}</div>
          </Link>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

export function Chat() {
  const { userId } = useParams();
  const { socket, toast } = useApp();
  const [other, setOther] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const end = useRef();
  useEffect(() => {
    api(`/users/${userId}`).then((d) => setOther(d.user)).catch(() => {});
    api(`/messages/${userId}`).then(setMsgs).catch(() => {});
  }, [userId]);
  useEffect(() => {
    const h = (m) => { if (m.from.id === userId) setMsgs((x) => [...x, { id: m.id, body: m.body, at: m.at, mine: false }]); };
    socket?.on('dm', h);
    return () => socket?.off('dm', h);
  }, [socket, userId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try { const m = await api('/messages', { method: 'POST', body: { to: userId, body: text } }); setMsgs((x) => [...x, m]); setText(''); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="page chat-page">
      <Header title={other?.name || 'Chat'} right={other && <Link to={`/user/${other.id}`}><Avatar user={other} size={32} frame={false} /></Link>} />
      <div className="dm-list">
        {msgs.map((m) => <div key={m.id} className={`dm ${m.mine ? 'mine' : ''}`}>{m.body}</div>)}
        <div ref={end} />
      </div>
      <form className="dm-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={300} />
        <button className="btn primary" aria-label="Send"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
