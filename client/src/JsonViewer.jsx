import React, { useState } from 'react';

const s = {
  tree: { fontFamily: 'monospace', fontSize: 12, lineHeight: 1.6 },
  key:  { color: '#7dd3fc' },
  str:  { color: '#86efac' },
  num:  { color: '#fbbf24' },
  bool: { color: '#f472b6' },
  null: { color: '#94a3b8' },
  toggle: { cursor: 'pointer', userSelect: 'none', color: '#94a3b8', marginRight: 4 },
  indent: { borderLeft: '1px solid #1e293b', marginLeft: 8, paddingLeft: 12 },
};

function JsonNode({ data, depth = 0 }) {
  const [open, setOpen] = useState(depth < 3);

  if (data === null) return <span style={s.null}>null</span>;
  if (typeof data === 'boolean') return <span style={s.bool}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={s.num}>{data}</span>;
  if (typeof data === 'string') return <span style={s.str}>"{data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={s.null}>[]</span>;
    return (
      <span>
        <span style={s.toggle} onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'}</span>
        {open ? (
          <div style={s.indent}>
            {data.map((item, i) => (
              <div key={i}>
                <span style={s.null}>{i}: </span>
                <JsonNode data={item} depth={depth + 1} />
              </div>
            ))}
          </div>
        ) : <span style={s.null}>[…{data.length}]</span>}
      </span>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span style={s.null}>{'{}'}</span>;
    return (
      <span>
        <span style={s.toggle} onClick={() => setOpen(o => !o)}>{open ? '▾' : '▸'}</span>
        {open ? (
          <div style={s.indent}>
            {keys.map(k => (
              <div key={k}>
                <span style={s.key}>"{k}"</span>
                <span style={s.null}>: </span>
                <JsonNode data={data[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        ) : <span style={s.null}>{`{…${keys.length}}`}</span>}
      </span>
    );
  }

  return <span>{String(data)}</span>;
}

export default function JsonViewer({ data }) {
  return (
    <div style={s.tree}>
      <JsonNode data={data} depth={0} />
    </div>
  );
}
