import { useState } from 'react';
import { api, del } from './lib/api.js';
import { Table, FormModal, useLoad, useAct, confirmAct } from './ui.jsx';

/**
 * Generic list + create/edit/delete for a config table backed by lib/crud.js on the server.
 * fields: FormModal fields. File fields (type:'file') are sent as multipart.
 */
export default function CrudPage({ path, pk = 'id', columns, fields, title, defaults = {}, toBody, extra, rowActions, newLabel = 'Add new' }) {
  const { data, loading, reload } = useLoad(`/admin/${path}`);
  const [edit, setEdit] = useState(null);
  const act = useAct();

  const save = async (v) => {
    const isEdit = edit && edit[pk] !== undefined && !edit.__new;
    const body = toBody ? toBody(v) : v;
    for (const f of fields) {
      if (f.type === 'json' && typeof body[f.name] === 'string') {
        try { body[f.name] = JSON.parse(body[f.name] || 'null'); } catch { throw new Error(`${f.label} is not valid JSON`); }
      }
      if (f.type === 'tags' && typeof body[f.name] === 'string') body[f.name] = body[f.name].split(',').map((s) => s.trim()).filter(Boolean);
    }
    const hasFile = fields.some((f) => f.type === 'file' && body[f.name] instanceof File);
    let opts;
    if (hasFile) {
      const form = new FormData();
      for (const [k, val] of Object.entries(body)) {
        if (val === undefined || val === null) continue;
        if (val instanceof File) form.append(k, val);
        else if (Array.isArray(val)) form.append(k, val.join(','));
        else if (typeof val === 'object') form.append(k, JSON.stringify(val));
        else form.append(k, val);
      }
      opts = { method: isEdit ? 'PUT' : 'POST', form };
    } else {
      for (const f of fields) if (f.type === 'file') delete body[f.name];
      opts = { method: isEdit ? 'PUT' : 'POST', body };
    }
    const r = await act(() => api(isEdit ? `/admin/${path}/${encodeURIComponent(edit[pk])}` : `/admin/${path}`, opts), 'Saved');
    if (r) { setEdit(null); reload(); }
  };

  const cols = [
    ...columns,
    {
      key: '_a', label: '', right: true, render: (r) => (
        <span className="row" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
          {rowActions?.(r, reload)}
          <button className="btn sm" onClick={() => setEdit(r)}>Edit</button>
          <button className="btn sm ghost" onClick={async () => { if (confirmAct('Delete this item? (items already used are deactivated instead)')) { await act(() => del(`/admin/${path}/${encodeURIComponent(r[pk])}`), 'Deleted'); reload(); } }}>Delete</button>
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        {title && <h2 className="grow">{title}</h2>}
        {extra}
        <button className="btn primary" onClick={() => setEdit({ ...defaults, __new: true })}>{newLabel}</button>
      </div>
      <Table columns={cols} rows={data} loading={loading} onRow={(r) => setEdit(r)} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.__new ? newLabel : 'Edit'} fields={fields} initial={edit || {}} onSubmit={save} />
    </>
  );
}
