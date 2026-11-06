import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, BottomNav, Empty, Header, Icon } from '../components/ui.jsx';

const ago = (ts) => {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(ts).toLocaleDateString('en-IN');
};
const preview = (m) => (m.kind === 'text' ? m.body : `[${m.kind}]`);

export default function Messages() {
  const { me, socket } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => {
    const load = () => api('/chats').then(setList).catch(() => setList([]));
    load();
    socket?.on('dm:new', load);
    socket?.on('dm:sent', load);
    return () => { socket?.off('dm:new', load); socket?.off('dm:sent', load); };
  }, [socket]);
  const myId = me?.user?.id;
  return (
    <div className="page with-nav">
      <Header title="Chats" back={false} />
      {list && list.length === 0 && <Empty icon="chat" text="No messages yet. Say hi to a host from their profile." />}
      <div className="list">
        {(list || []).map((c) => (
          <Link key={c.other} to={`/chat/${c.other}`} className="list-row">
            <Avatar user={c.user} size={48} />
            <div className="grow"><b>{c.user?.name || `User ${c.other}`}</b><small>{c.from_id === myId ? 'You: ' : ''}{preview(c)}</small></div>
            <div className="right"><small className="muted">{ago(c.created_at)}</small>{c.unread > 0 && <span className="unread">{c.unread}</span>}</div>
          </Link>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}

export function Chat() {
  const { userId } = useParams();
  const { me, socket, toast } = useApp();
  const myId = me?.user?.id;
  const [other, setOther] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const end = useRef();
  useEffect(() => {
    api(`/chats/${userId}`).then((d) => { setOther(d.user); setMsgs(d.messages || []); }).catch((e) => toast(e.message, 'error'));
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = ({ message, from }) => {
      if (String(from?.id) === String(userId)) setMsgs((x) => [...x, message]);
    };
    socket?.on('dm:new', h);
    return () => socket?.off('dm:new', h);
  }, [socket, userId]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    try { const m = await api(`/chats/${userId}`, { method: 'POST', body: { body: text } }); setMsgs((x) => [...x, m]); setText(''); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="page chat-page">
      <Header title={other?.name || 'Chat'} right={other && <Link to={`/user/${other.id}`}><Avatar user={other} size={32} frame={false} /></Link>} />
      <div className="dm-list">
        {msgs.map((m) => <div key={m.id} className={`dm ${m.from_id === myId ? 'mine' : ''}`}>{m.kind === 'text' || !m.kind ? m.body : <em>[{m.kind}]</em>}</div>)}
        <div ref={end} />
      </div>
      <form className="dm-form" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={300} />
        <button className="btn primary" aria-label="Send"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
