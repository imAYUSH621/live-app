import { useState } from 'react';
import { get, post, put, num, dt, media } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, Tabs, Modal, FormModal, UserCell, confirmAct } from '../ui.jsx';
import CrudPage from '../crud.jsx';

const yes = (v) => (v ? <Badge v="on" kind="green" /> : <Badge v="off" kind="red" />);
const cats = ['normal', 'luxury', 'lucky', 'event', 'exclusive', 'vip'];

export function Gifts() {
  return (
    <>
      <div className="head"><h1>Gifts</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
        Icon can be an emoji or an image URL. For premium 3D animations upload a Lottie (.json), SVGA (.svga) or MP4 file and set the animation type.
        Built-in effects use <code>css:car</code>, <code>css:rocket</code>, <code>css:castle</code>, <code>css:dragon</code>, <code>css:galaxy</code>, <code>css:fireworks</code>, <code>css:hearts</code>, <code>css:crown</code>, <code>css:float</code>.
      </p>
      <CrudPage path="gifts" newLabel="New gift" defaults={{ icon: '🎁', anim_type: 'css', anim_url: 'css:float', price: 10, host_pct: 60, category: 'normal', vip_level: 0, active: true, sort: 0 }}
        columns={[
          { label: '', render: (r) => <span style={{ fontSize: 26 }}>{/^(\/|http)/.test(r.icon) ? <img src={media(r.icon)} alt="" width="30" /> : r.icon}</span> },
          { key: 'name', label: 'Name' }, { label: 'Price', right: true, render: (r) => `🪙 ${num(r.price)}` }, { label: 'Host %', right: true, render: (r) => `${r.host_pct}%` },
          { label: 'Category', render: (r) => <Badge v={r.category} kind="" /> }, { label: 'Animation', render: (r) => <span className="small">{r.anim_type} {r.anim_url}</span> },
          { label: 'VIP', render: (r) => r.vip_level || '—' }, { label: 'Window', render: (r) => <span className="small">{r.starts_at ? dt(r.starts_at) : ''}{r.ends_at ? ` → ${dt(r.ends_at)}` : ''}</span> },
          { label: 'Active', render: (r) => yes(r.active) }, { key: 'sort', label: 'Sort' },
        ]}
        fields={[
          { name: 'name', label: 'Name' }, { name: 'icon', label: 'Icon (emoji or image URL)' },
          { name: 'price', label: 'Price (coins)', type: 'number' }, { name: 'host_pct', label: 'Receiver gets % as diamonds', type: 'number', hint: 'Lucky gifts use the lucky-gift % from settings.' },
          { name: 'category', label: 'Category', type: 'select', options: cats },
          { name: 'anim_type', label: 'Animation type', type: 'select', options: ['css', 'lottie', 'svga', 'mp4', 'none'] },
          { name: 'anim_url', label: 'Animation (css:effect or file URL)' }, { name: 'anim_url_file', label: 'Or upload animation file', type: 'file', accept: '.json,.svga,.mp4,.webm,.webp,.gif' },
          { name: 'vip_level', label: 'VIP level required', type: 'number' }, { name: 'countries', label: 'Only in countries (empty = all)', type: 'tags' },
          { name: 'starts_at', label: 'Available from', type: 'date' }, { name: 'ends_at', label: 'Available until', type: 'date' },
          { name: 'sort', label: 'Sort order', type: 'number' }, { name: 'active', label: 'Active', type: 'checkbox' },
        ]}
        toBody={(v) => {
          const b = { ...v };
          if (b.anim_url_file instanceof File) { b.anim_url = b.anim_url_file; }
          delete b.anim_url_file;
          if (!b.starts_at) b.starts_at = ''; if (!b.ends_at) b.ends_at = '';
          return b;
        }}
      />
    </>
  );
}

export function StoreAdmin() {
  const [tab, setTab] = useState('items');
  return (
    <>
      <div className="head"><h1>Store, VIP & Noble</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['items', 'Items'], ['vip', 'VIP levels'], ['noble', 'Noble ranks'], ['ids', 'Pretty IDs']]} />
      {tab === 'items' && (
        <CrudPage path="store-items" newLabel="New item" defaults={{ type: 'frame', price: 500, duration_days: 30, vip_level: 0, active: true, sort: 0 }}
          columns={[
            { label: '', render: (r) => <span style={{ fontSize: 22 }}>{String(r.preview).length <= 4 ? r.preview : '🖼'}</span> }, { key: 'name', label: 'Name' },
            { label: 'Type', render: (r) => <Badge v={r.type} kind="" /> }, { key: 'preview', label: 'Preview token' }, { label: 'Price', right: true, render: (r) => `🪙 ${num(r.price)}` },
            { label: 'Days', right: true, render: (r) => r.duration_days }, { label: 'VIP', render: (r) => r.vip_level || '—' }, { label: 'Active', render: (r) => yes(r.active) },
          ]}
          fields={[
            { name: 'type', label: 'Type', type: 'select', options: [['frame', 'Avatar frame'], ['mount', 'Ride / car (entry)'], ['bubble', 'Chat bubble'], ['entry', 'Entry effect'], ['badge', 'Badge']] },
            { name: 'name', label: 'Name' },
            { name: 'preview', label: 'Preview', hint: 'Frames: frame-gold / frame-neon / frame-wings / frame-crown. Bubbles: bubble-pink / bubble-galaxy / bubble-gold. Others: an emoji.' },
            { name: 'anim_url', label: 'Animation file (optional)', type: 'file', accept: '.json,.svga,.mp4,.webp,.gif,.png' },
            { name: 'price', label: 'Price (coins)', type: 'number' }, { name: 'duration_days', label: 'Duration (days)', type: 'number' },
            { name: 'vip_level', label: 'VIP level required', type: 'number' }, { name: 'sort', label: 'Sort', type: 'number' }, { name: 'active', label: 'Active', type: 'checkbox' },
          ]} />
      )}
      {tab === 'vip' && (
        <CrudPage path="vip-levels" pk="level" newLabel="New VIP level" defaults={{ duration_days: 30, perks: { badge: true } }}
          columns={[{ key: 'level', label: 'Level' }, { key: 'name', label: 'Name' }, { label: 'Price', right: true, render: (r) => `🪙 ${num(r.price)}` }, { key: 'duration_days', label: 'Days' },
            { label: 'Perks', render: (r) => <span className="small">{Object.keys(r.perks || {}).filter((k) => r.perks[k]).join(', ')}</span> }]}
          fields={[{ name: 'level', label: 'Level number', type: 'number' }, { name: 'name', label: 'Name' }, { name: 'price', label: 'Price (coins)', type: 'number' }, { name: 'duration_days', label: 'Days', type: 'number' },
            { name: 'perks', label: 'Perks (JSON)', type: 'json', hint: 'Keys: badge, colored_name, see_visitors, vip_gifts, entry_effect, anti_kick, special_frame, top_of_list, global_entry' }]} />
      )}
      {tab === 'noble' && (
        <CrudPage path="noble-ranks" pk="rank" newLabel="New noble rank" defaults={{ duration_days: 30, perks: {} }}
          columns={[{ key: 'rank', label: 'Rank' }, { key: 'name', label: 'Name' }, { label: 'Price', right: true, render: (r) => `🪙 ${num(r.price)}` }, { label: 'Cashback', right: true, render: (r) => num(r.cashback) }, { key: 'duration_days', label: 'Days' }]}
          fields={[{ name: 'rank', label: 'Rank number', type: 'number' }, { name: 'name', label: 'Name' }, { name: 'price', label: 'Price (coins)', type: 'number' }, { name: 'cashback', label: 'Coins returned on purchase', type: 'number' },
            { name: 'duration_days', label: 'Days', type: 'number' }, { name: 'perks', label: 'Perks (JSON)', type: 'json', hint: 'throne_seat, anti_kick, global_entry, exclusive_gifts' }]} />
      )}
      {tab === 'ids' && (
        <CrudPage path="fancy-ids" newLabel="Add pretty ID" defaults={{ status: 'available' }}
          columns={[{ key: 'number', label: 'Number' }, { label: 'Price', right: true, render: (r) => `🪙 ${num(r.price)}` }, { label: 'Status', render: (r) => <Badge v={r.status} kind={r.status === 'sold' ? 'green' : ''} /> }, { label: 'Sold', render: (r) => dt(r.sold_at) }]}
          fields={[{ name: 'number', label: 'Number' }, { name: 'price', label: 'Price (coins)', type: 'number' }, { name: 'status', label: 'Status', type: 'select', options: ['available', 'reserved', 'sold'] }]} />
      )}
    </>
  );
}

export function Banners() {
  return (
    <>
      <div className="head"><h1>Banners</h1></div>
      <CrudPage path="banners" newLabel="New banner" defaults={{ position: 'home', color: '#7c3aed', active: true, sort: 0 }}
        columns={[
          { label: 'Preview', render: (r) => <div style={{ width: 140, height: 44, borderRadius: 8, background: r.image_url ? `url(${media(r.image_url)}) center/cover` : r.color, color: '#fff', fontSize: 11, padding: 6, overflow: 'hidden' }}>{!r.image_url && r.title}</div> },
          { key: 'title', label: 'Title' }, { label: 'Where', render: (r) => <Badge v={r.position} kind="" /> }, { key: 'link', label: 'Opens' },
          { label: 'Window', render: (r) => <span className="small">{dt(r.starts_at)} → {dt(r.ends_at)}</span> }, { label: 'Active', render: (r) => yes(r.active) },
        ]}
        fields={[
          { name: 'title', label: 'Title (shown when no image)' }, { name: 'image_url', label: 'Image (1080×360 works well)', type: 'file', accept: 'image/*' },
          { name: 'color', label: 'Background colour', type: 'color' }, { name: 'link', label: 'Opens app page (e.g. /wallet, /events/3, /live/12)' },
          { name: 'position', label: 'Position', type: 'select', options: ['home', 'live', 'recharge'] }, { name: 'countries', label: 'Countries (empty = all)', type: 'tags' },
          { name: 'starts_at', label: 'Start', type: 'date' }, { name: 'ends_at', label: 'End', type: 'date' }, { name: 'sort', label: 'Sort', type: 'number' }, { name: 'active', label: 'Active', type: 'checkbox' },
        ]}
        toBody={(v) => ({ ...v, starts_at: v.starts_at || '', ends_at: v.ends_at || '' })} />
    </>
  );
}

export function Events() {
  const [board, setBoard] = useState(null);
  const { data: gifts } = useLoad('/admin/gifts');
  const act = useAct();
  return (
    <>
      <div className="head"><h1>Events & campaigns</h1></div>
      <CrudPage path="events" newLabel="New event"
        defaults={{ type: 'gift_collect', active: true, rewards: [{ rank_from: 1, rank_to: 1, coins: 5000 }, { rank_from: 2, rank_to: 3, coins: 2000 }] }}
        columns={[
          { key: 'title', label: 'Event' }, { label: 'Type', render: (r) => <Badge v={r.type} kind="" /> },
          { label: 'Runs', render: (r) => <span className="small">{dt(r.starts_at)} → {dt(r.ends_at)}</span> },
          { label: 'State', render: (r) => (r.rewarded ? <Badge v="rewarded" kind="green" /> : new Date(r.ends_at) < new Date() ? <Badge v="ended" kind="gold" /> : new Date(r.starts_at) > new Date() ? <Badge v="scheduled" kind="" /> : <Badge v="running" kind="green" />) },
          { label: 'Active', render: (r) => yes(r.active) },
        ]}
        rowActions={(r, reload) => (
          <>
            <button className="btn sm" onClick={async () => setBoard({ ev: r, rows: await get(`/admin/events/${r.id}/board`) })}>Leaderboard</button>
            {!r.rewarded && new Date(r.ends_at) < new Date() && <button className="btn sm gold" onClick={async () => { if (confirmAct('Send rewards to the winners now?')) { await act(() => post(`/admin/events/${r.id}/distribute`), 'Rewards sent'); reload(); } }}>Send rewards</button>}
          </>
        )}
        fields={[
          { name: 'title', label: 'Title' },
          { name: 'type', label: 'Ranks by', type: 'select', options: [['gift_collect', 'Gifts received (hosts)'], ['gift_send', 'Gifts sent (users)'], ['recharge', 'Recharge amount'], ['pk', 'PK wins'], ['live_hours', 'Live hours']] },
          { name: 'gift_id', label: 'Count only this gift (optional)', type: 'select', options: [['', '— any gift —'], ...(gifts || []).map((g) => [g.id, `${g.icon} ${g.name}`])] },
          { name: 'description', label: 'Rules shown to users', type: 'textarea' }, { name: 'banner_url', label: 'Banner image', type: 'file', accept: 'image/*' },
          { name: 'starts_at', label: 'Start', type: 'date' }, { name: 'ends_at', label: 'End', type: 'date' },
          { name: 'rewards', label: 'Rewards (JSON)', type: 'json', hint: '[{"rank_from":1,"rank_to":1,"coins":5000,"item_id":0,"item_days":7}]' },
          { name: 'countries', label: 'Countries (empty = all)', type: 'tags' }, { name: 'active', label: 'Active', type: 'checkbox' },
        ]}
        toBody={(v) => ({ ...v, gift_id: v.gift_id || '' })} />
      <Modal open={!!board} onClose={() => setBoard(null)} title={board ? `${board.ev.title} — leaderboard` : ''}>
        <Table rows={board?.rows} columns={[{ key: 'rank', label: '#' }, { label: 'User', render: (r) => <UserCell u={r.user} /> }, { label: 'Score', right: true, render: (r) => num(r.score) }]} />
      </Modal>
    </>
  );
}

export function Tasks() {
  return (
    <>
      <div className="head"><h1>Daily tasks</h1></div>
      <CrudPage path="tasks" pk="key" newLabel="New task" defaults={{ target: 1, reward_coins: 5, active: true, for_hosts: false, metric: 'send_gift' }}
        columns={[{ key: 'key', label: 'Key' }, { key: 'title', label: 'Title' }, { key: 'metric', label: 'Counts' }, { key: 'target', label: 'Target' }, { label: 'Reward', render: (r) => `🪙 ${r.reward_coins}` }, { label: 'Hosts only', render: (r) => (r.for_hosts ? 'yes' : '') }, { label: 'Active', render: (r) => yes(r.active) }]}
        fields={[{ name: 'key', label: 'Key (unique, no spaces)' }, { name: 'title', label: 'Title' },
          { name: 'metric', label: 'What counts', type: 'select', options: [['watch_minutes', 'Minutes watched'], ['send_gift', 'Gifts sent'], ['follow', 'People followed'], ['chat', 'Messages sent'], ['post_moment', 'Moments posted'], ['live_minutes', 'Minutes live (hosts)']] },
          { name: 'target', label: 'Target', type: 'number' }, { name: 'reward_coins', label: 'Reward coins', type: 'number' }, { name: 'sort', label: 'Sort', type: 'number' },
          { name: 'for_hosts', label: 'Only for hosts', type: 'checkbox' }, { name: 'active', label: 'Active', type: 'checkbox' }]} />
    </>
  );
}

export function Cms() {
  return (
    <>
      <div className="head"><h1>Pages & policies</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>Shown in the app at /page/&lt;slug&gt;. Have your lawyer review terms, privacy, host and agency policy.</p>
      <CrudPage path="cms" pk="slug" newLabel="New page"
        columns={[{ key: 'slug', label: 'Slug' }, { key: 'title', label: 'Title' }, { label: 'Updated', render: (r) => dt(r.updated_at) }]}
        fields={[{ name: 'slug', label: 'Slug' }, { name: 'title', label: 'Title' }, { name: 'body', label: 'Content', type: 'textarea', rows: 14 }]} />
    </>
  );
}

export function HostLevels() {
  return (
    <>
      <div className="head"><h1>Host levels & salary sheet</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>
        Each month a host reaches the highest level whose diamonds, hours and valid days they meet. Salary = diamonds ÷ diamonds-per-₹ (Economy) + the level bonus when the monthly target is met.
      </p>
      <CrudPage path="host-levels" pk="code" newLabel="New level"
        columns={[{ key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { label: 'Min diamonds', right: true, render: (r) => num(r.min_diamonds) }, { label: 'Min hours', right: true, render: (r) => r.min_hours },
          { label: 'Min days', right: true, render: (r) => r.min_days }, { label: 'Bonus', right: true, render: (r) => `₹${num(r.bonus_amount)}` }, { label: 'Max call rate', right: true, render: (r) => r.max_call_rate }]}
        fields={[{ name: 'code', label: 'Code' }, { name: 'name', label: 'Name' }, { name: 'min_diamonds', label: 'Min diamonds / month', type: 'number' }, { name: 'min_hours', label: 'Min live hours', type: 'number' },
          { name: 'min_days', label: 'Min valid days', type: 'number' }, { name: 'bonus_amount', label: 'Bonus (₹)', type: 'number' }, { name: 'max_call_rate', label: 'Max call rate (coins/min)', type: 'number' }, { name: 'sort', label: 'Sort', type: 'number' }]} />
    </>
  );
}

export function Notifications() {
  const { data, reload } = useLoad('/admin/notifications');
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [banner, setBanner] = useState(false);
  return (
    <>
      <div className="head"><h1>Notifications</h1><button className="btn" onClick={() => setBanner(true)}>Flash banner in all rooms</button><button className="btn primary" onClick={() => setOpen(true)}>Send notification</button></div>
      <Table rows={data} columns={[{ key: 'title', label: 'Title' }, { key: 'body', label: 'Message' }, { label: 'To', render: (r) => (r.user_id ? `user #${r.user_id}` : 'everyone') }, { key: 'by_email', label: 'By' }, { label: 'When', render: (r) => dt(r.created_at) }]} />
      <FormModal open={open} onClose={() => setOpen(false)} title="Send notification" submitLabel="Send"
        fields={[
          { name: 'title', label: 'Title' }, { name: 'body', label: 'Message', type: 'textarea' }, { name: 'link', label: 'Opens app page (optional)' },
          { name: 'uid', label: 'Only this user ID (optional)' }, { name: 'country', label: 'Only country (e.g. IN)' }, { name: 'min_level', label: 'Min user level', type: 'number' },
          { name: 'payer', label: 'Paying users', type: 'select', options: [['', 'Everyone'], ['yes', 'Only payers'], ['no', 'Only never-paid']] },
          { name: 'inactive_days', label: 'Inactive for at least N days', type: 'number' }, { name: 'hosts', label: 'Only hosts', type: 'checkbox' },
          { name: 'push', label: 'Also send phone push (Firebase)', type: 'checkbox' },
        ]}
        onSubmit={async (v) => {
          const segment = { uid: v.uid, country: v.country, min_level: v.min_level, payer: v.payer, inactive_days: v.inactive_days, hosts: v.hosts };
          const r = await act(() => post('/admin/notifications', { title: v.title, body: v.body, link: v.link, push: v.push, segment }), null);
          if (r) { window.alert(`Sent to ${r.recipients}. Push delivered: ${r.pushed}`); setOpen(false); reload(); }
        }} />
      <FormModal open={banner} onClose={() => setBanner(false)} title="Flash banner (6 seconds, everyone online)" submitLabel="Send"
        fields={[{ name: 'text', label: 'Text' }]} onSubmit={async (v) => { await act(() => post('/admin/broadcast', v), 'Banner sent'); setBanner(false); }} />
    </>
  );
}

export function Families() {
  const { data, reload } = useLoad('/admin/families');
  const act = useAct();
  const [edit, setEdit] = useState(null);
  return (
    <>
      <div className="head"><h1>Families</h1></div>
      <Table rows={data} onRow={setEdit} columns={[
        { label: 'Family', render: (r) => `${r.badge} ${r.name}` }, { label: 'Owner', render: (r) => `${r.owner_name} (${r.owner_uid})` },
        { label: 'Level', right: true, render: (r) => r.level }, { label: 'XP', right: true, render: (r) => num(r.exp) }, { label: 'Members', right: true, render: (r) => `${r.members}/${r.max_members}` },
        { label: 'Status', render: (r) => <Badge v={r.status} kind={r.status === 'active' ? 'green' : 'red'} /> },
      ]} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={`Edit ${edit?.name}`}
        fields={[{ name: 'name', label: 'Name' }, { name: 'level', label: 'Level', type: 'number' }, { name: 'max_members', label: 'Max members', type: 'number' }, { name: 'notice', label: 'Notice', type: 'textarea' }, { name: 'disband', label: 'Disband this family', type: 'checkbox' }]}
        initial={edit || {}} onSubmit={async (v) => { await act(() => put(`/admin/families/${edit.id}`, v), 'Saved'); setEdit(null); reload(); }} />
    </>
  );
}

export function Rankings() {
  const [type, setType] = useState('rich');
  const [period, setPeriod] = useState('daily');
  const act = useAct();
  const [rows, setRows] = useState(null);
  const load = async () => setRows(await get(`/admin/rankings?type=${type}&period=${period}`).catch(() => []));
  return (
    <>
      <div className="head"><h1>Rankings</h1><button className="btn" onClick={async () => { await act(() => post('/admin/rankings/refresh'), 'Cache cleared'); load(); }}>Refresh cache</button></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 14 }}>Rankings are computed live from gifts. Excluding a user tags them "test" and hides them from every board.</p>
      <div className="filters">
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="rich">Rich (gifters)</option><option value="charm">Charm (hosts)</option><option value="pk">PK wins</option><option value="family">Families</option></select>
        <select value={period} onChange={(e) => setPeriod(e.target.value)}><option value="daily">Today</option><option value="weekly">This week</option><option value="monthly">This month</option></select>
        <button className="btn primary" onClick={load}>Show</button>
      </div>
      {rows && <Table rows={rows} columns={[{ key: 'rank', label: '#' }, { label: 'Who', render: (r) => (r.user ? <UserCell u={r.user} /> : `${r.family.badge} ${r.family.name}`) }, { label: 'Score', right: true, render: (r) => num(r.score) },
        { label: '', render: (r) => r.user && <button className="btn sm danger" onClick={async () => { await act(() => post('/admin/rankings/exclude', { user_id: r.user.id }), 'Excluded'); load(); }}>Exclude</button> }]} />}
    </>
  );
}
