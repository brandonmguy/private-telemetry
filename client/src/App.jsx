import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
} from '@tanstack/react-table';
import { fetchMessages, fetchMessage, fetchSources, fetchEventTypes, fetchStats, clearMessages, downloadExport } from './api.js';
import JsonViewer from './JsonViewer.jsx';

// ── Styles ────────────────────────────────────────────────────────────────────
const CSS = `
  :root {
    --bg:       #0f1117;
    --surface:  #1a1f2e;
    --surface2: #242938;
    --border:   #2d3348;
    --accent:   #3b82f6;
    --accent2:  #1d4ed8;
    --text:     #e2e8f0;
    --muted:    #64748b;
    --green:    #22c55e;
    --yellow:   #eab308;
    --red:      #ef4444;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; font-size: 13px; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--surface); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  .layout { display: grid; grid-template-columns: 240px 1fr; grid-template-rows: 48px 1fr; height: 100vh; overflow: hidden; }
  .topbar { grid-column: 1 / -1; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; padding: 0 16px; gap: 12px; }
  .topbar-title { font-size: 15px; font-weight: 600; color: var(--text); flex: 1; }
  .topbar-title span { color: var(--accent); }
  .stat-pill { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 3px 10px; font-size: 11px; color: var(--muted); white-space: nowrap; }
  .stat-pill strong { color: var(--text); margin-left: 4px; }
  .btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); cursor: pointer; font-size: 12px; transition: all 0.15s; }
  .btn:hover { background: var(--border); }
  .btn-danger { border-color: var(--red); color: var(--red); }
  .btn-danger:hover { background: rgba(239,68,68,0.15); }
  .btn-primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .btn-primary:hover { background: var(--accent2); }

  .sidebar { background: var(--surface); border-right: 1px solid var(--border); overflow-y: auto; padding: 12px 0; }
  .sidebar-section { margin-bottom: 8px; }
  .sidebar-header { padding: 6px 16px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); }
  .sidebar-item { display: flex; align-items: center; padding: 5px 16px; cursor: pointer; border-left: 2px solid transparent; transition: all 0.1s; }
  .sidebar-item:hover { background: var(--surface2); }
  .sidebar-item.active { background: rgba(59,130,246,0.1); border-left-color: var(--accent); color: var(--accent); }
  .sidebar-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sidebar-count { font-size: 10px; color: var(--muted); background: var(--surface2); border-radius: 10px; padding: 1px 6px; min-width: 28px; text-align: center; }
  .sidebar-item.active .sidebar-count { background: rgba(59,130,246,0.2); color: var(--accent); }

  .main { display: flex; flex-direction: column; overflow: hidden; }
  .toolbar { padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .search-box { flex: 1; min-width: 200px; display: flex; align-items: center; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 10px; gap: 6px; }
  .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 13px; width: 100%; }
  .search-box input::placeholder { color: var(--muted); }
  .filter-select { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; color: var(--text); font-size: 12px; outline: none; }
  .filter-select option { background: var(--surface2); }
  .filter-input { background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 5px 8px; color: var(--text); font-size: 12px; outline: none; width: 160px; }

  .content { display: flex; flex: 1; overflow: hidden; }
  .table-wrap { flex: 1; overflow: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  thead { position: sticky; top: 0; z-index: 10; background: var(--surface2); }
  th { padding: 8px 12px; text-align: left; font-weight: 500; color: var(--muted); border-bottom: 1px solid var(--border); white-space: nowrap; cursor: pointer; user-select: none; }
  th:hover { color: var(--text); }
  th .sort-icon { margin-left: 4px; opacity: 0.5; }
  th.sorted .sort-icon { opacity: 1; color: var(--accent); }
  td { padding: 7px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  tr { cursor: pointer; transition: background 0.1s; }
  tr:hover td { background: var(--surface2); }
  tr.selected td { background: rgba(59,130,246,0.08) !important; }
  .cell-mono { font-family: monospace; font-size: 11px; color: var(--muted); }
  .cell-name { font-family: monospace; font-size: 11px; color: #7dd3fc; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell-source { font-weight: 500; color: var(--text); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 10px; font-weight: 500; }
  .badge-telemetry { background: rgba(59,130,246,0.15); color: #7dd3fc; }
  .badge-request   { background: rgba(234,179,8,0.15);  color: #fde047; }
  .badge-response  { background: rgba(34,197,94,0.15);  color: #86efac; }
  .badge-other     { background: rgba(100,116,139,0.15);color: #94a3b8; }

  .pagination { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); background: var(--surface); font-size: 12px; color: var(--muted); }
  .pagination .pag-btn { padding: 3px 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface2); color: var(--text); cursor: pointer; font-size: 11px; }
  .pagination .pag-btn:disabled { opacity: 0.4; cursor: default; }
  .pagination-info { flex: 1; }

  .detail-panel { width: 420px; border-left: 1px solid var(--border); background: var(--surface); display: flex; flex-direction: column; overflow: hidden; }
  .detail-header { padding: 12px 16px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 8px; }
  .detail-header h3 { flex: 1; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-meta { padding: 10px 16px; border-bottom: 1px solid var(--border); display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .meta-item { display: flex; flex-direction: column; gap: 1px; }
  .meta-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
  .meta-value { font-size: 11px; font-family: monospace; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .detail-json { flex: 1; overflow: auto; padding: 12px 16px; }
  .detail-empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px; flex-direction: column; gap: 8px; }

  .loading { display: flex; align-items: center; justify-content: center; padding: 40px; color: var(--muted); gap: 8px; }
  .dot-spin { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: spin 1s infinite; }
  @keyframes spin { 0%,100%{opacity:1} 50%{opacity:0.2} }

  .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.6;transform:scale(1.2)} }

  .clear-confirm { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
  .clear-dialog { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 24px; width: 320px; text-align: center; }
  .clear-dialog h4 { margin-bottom: 8px; font-size: 15px; }
  .clear-dialog p { color: var(--muted); margin-bottom: 20px; font-size: 13px; }
  .clear-dialog .actions { display: flex; gap: 8px; justify-content: center; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

function localDateInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function typeBadge(t) {
  if (!t) return <span className="badge badge-other">—</span>;
  const lower = t.toLowerCase();
  if (lower.includes('telemetry')) return <span className="badge badge-telemetry">{t}</span>;
  if (lower.includes('request'))   return <span className="badge badge-request">{t}</span>;
  if (lower.includes('response'))  return <span className="badge badge-response">{t}</span>;
  return <span className="badge badge-other">{t}</span>;
}

const PAGE_SIZES = [25, 50, 100, 200];
const columnHelper = createColumnHelper();

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages]     = useState([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(50);
  const [sources, setSources]       = useState([]);
  const [eventTypes, setEventTypes] = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail]         = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showClear, setShowClear]   = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  // Filters
  const [filterSource, setFilterSource]     = useState('');
  const [filterName, setFilterName]         = useState('');
  const [filterMsgType, setFilterMsgType]   = useState('');
  const [filterFrom, setFilterFrom]         = useState('');
  const [filterTo, setFilterTo]             = useState('');
  const [search, setSearch]                 = useState('');
  const [searchInput, setSearchInput]       = useState('');

  // Sorting
  const [sorting, setSorting] = useState([{ id: 'received_at', desc: true }]);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshRef = useRef(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const sort = sorting[0];
      const data = await fetchMessages({
        page,
        pageSize,
        source:     filterSource  || undefined,
        name:       filterName    || undefined,
        msg_type:   filterMsgType || undefined,
        search:     search        || undefined,
        from:       filterFrom    || undefined,
        to:         filterTo      || undefined,
        sort:       sort?.id      || 'received_at',
        dir:        sort?.desc    ? 'desc' : 'asc',
      });
      setMessages(data.rows);
      setTotal(data.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterSource, filterName, filterMsgType, search, filterFrom, filterTo, sorting]);

  const loadSidebar = useCallback(async () => {
    try {
      const [s, e, st] = await Promise.all([fetchSources(), fetchEventTypes(), fetchStats()]);
      setSources(s);
      setEventTypes(e);
      setStats(st);
    } catch (error) { setError(error.message); }
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { loadSidebar(); }, [loadSidebar]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (!autoRefresh) { clearInterval(refreshRef.current); return; }
    refreshRef.current = setInterval(() => {
      loadMessages();
      loadSidebar();
    }, 5000);
    return () => clearInterval(refreshRef.current);
  }, [autoRefresh, loadMessages, loadSidebar]);

  // Load detail when row selected
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetailLoading(true);
    fetchMessage(selectedId)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterSource, filterName, filterMsgType, search, filterFrom, filterTo]);

  const handleClear = async () => {
    try {
      await clearMessages();
      setShowClear(false);
      setSelectedId(null);
      setDetail(null);
      loadMessages();
      loadSidebar();
    } catch (error) { setError(error.message); }
  };

  const handleExport = async (format) => {
    setExporting(true);
    try {
      await downloadExport({ source: filterSource, name: filterName, msg_type: filterMsgType,
        search, from: filterFrom, to: filterTo, sort: sorting[0]?.id,
        dir: sorting[0]?.desc ? 'desc' : 'asc' }, format);
    } catch (error) { setError(error.message); }
    finally { setExporting(false); }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const resetFilters = () => {
    setFilterSource('');
    setFilterName('');
    setFilterMsgType('');
    setFilterFrom('');
    setFilterTo('');
    setSearch('');
    setSearchInput('');
  };

  // ── Table columns ───────────────────────────────────────────────────────────
  const columns = [
    columnHelper.accessor('received_at', {
      header: 'Received',
      cell: i => <span className="cell-mono">{fmtTime(i.getValue())}</span>,
      size: 150,
    }),
    columnHelper.accessor('source', {
      header: 'Source',
      cell: i => <span className="cell-source" title={i.getValue()}>{i.getValue() || '—'}</span>,
      size: 170,
    }),
    columnHelper.accessor('name', {
      header: 'Event Name',
      cell: i => <span className="cell-name" title={i.getValue()}>{i.getValue() || '—'}</span>,
      size: 240,
    }),
    columnHelper.accessor('msg_type', {
      header: 'Type',
      cell: i => typeBadge(i.getValue()),
      size: 100,
    }),
    columnHelper.accessor('event_type', {
      header: 'Event Type',
      cell: i => <span className="cell-mono">{i.getValue() || '—'}</span>,
      size: 120,
    }),
    columnHelper.accessor('event_time', {
      header: 'Event Time',
      cell: i => <span className="cell-mono">{fmtTime(i.getValue())}</span>,
      size: 150,
    }),
    columnHelper.accessor('frame_id', {
      header: 'Frame ID',
      cell: i => <span className="cell-mono" style={{ fontSize: 10, color: '#475569' }} title={i.getValue()}>{i.getValue() ? i.getValue().slice(0, 16) + '…' : '—'}</span>,
      size: 120,
    }),
    columnHelper.accessor('source_ip', {
      header: 'Source IP',
      cell: i => <span className="cell-mono">{i.getValue() || '—'}</span>,
      size: 120,
    }),
  ];

  const table = useReactTable({
    data: messages,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualSorting: true,
    manualPagination: true,
    pageCount: Math.ceil(total / pageSize),
  });

  const totalPages = Math.ceil(total / pageSize);
  const hasFilters = filterSource || filterName || filterMsgType || search || filterFrom || filterTo;

  // ── Event type options for dropdown ────────────────────────────────────────
  const msgTypeOptions = ['telemetry', 'request', 'response'];

  return (
    <>
      <style>{CSS}</style>

      {/* Clear confirm dialog */}
      {showClear && (
        <div className="clear-confirm" onClick={() => setShowClear(false)}>
          <div className="clear-dialog" onClick={e => e.stopPropagation()}>
            <h4>Clear all messages?</h4>
            <p>This will permanently delete all {(stats?.total ?? total).toLocaleString()} stored messages, including messages hidden by filters.</p>
            <div className="actions">
              <button className="btn" onClick={() => setShowClear(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleClear}>Clear All</button>
            </div>
          </div>
        </div>
      )}

      <div className="layout">
        {/* Top bar */}
        <header className="topbar">
          <div className="topbar-title">Lens <span>Telemetry</span> Viewer <small>· Lab sample</small></div>
          {stats && (
            <>
              <div className="stat-pill">Total<strong>{stats.total.toLocaleString()}</strong></div>
              <div className="stat-pill">Last 24h<strong>{stats.last24h.toLocaleString()}</strong></div>
              <div className="stat-pill">Sources<strong>{stats.sources}</strong></div>
              <div className="stat-pill">Event Types<strong>{stats.eventTypes}</strong></div>
            </>
          )}
          <button
            className="btn"
            onClick={() => setAutoRefresh(r => !r)}
            title={autoRefresh ? 'Disable auto-refresh' : 'Enable auto-refresh'}
          >
            {autoRefresh ? <span className="live-dot" /> : '○'}
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button className="btn" onClick={() => { loadMessages(); loadSidebar(); }}>↻ Refresh</button>
          <button className="btn btn-danger" onClick={() => setShowClear(true)}>🗑 Clear</button>
        </header>

        {/* Sidebar */}
        <aside className="sidebar">
          {/* All */}
          <div className="sidebar-section">
            <div
              className={`sidebar-item ${!filterSource && !filterName ? 'active' : ''}`}
              onClick={resetFilters}
            >
              <span className="sidebar-label">All Messages</span>
              <span className="sidebar-count">{stats?.total ?? '…'}</span>
            </div>
          </div>

          {/* By Source */}
          <div className="sidebar-section">
            <div className="sidebar-header">By Source</div>
            {sources.map(s => (
              <div
                key={s.source}
                className={`sidebar-item ${filterSource === s.source ? 'active' : ''}`}
                onClick={() => {
                  setFilterSource(prev => prev === s.source ? '' : s.source);
                  setFilterName('');
                }}
                title={s.source}
              >
                <span className="sidebar-label">{s.source || '(unknown)'}</span>
                <span className="sidebar-count">{s.count}</span>
              </div>
            ))}
          </div>

          {/* By Event Type */}
          <div className="sidebar-section">
            <div className="sidebar-header">By Event Name</div>
            {eventTypes.slice(0, 30).map(e => (
              <div
                key={e.name}
                className={`sidebar-item ${filterName === e.name ? 'active' : ''}`}
                onClick={() => {
                  setFilterName(prev => prev === e.name ? '' : e.name);
                  setFilterSource('');
                }}
                title={e.name}
              >
                <span className="sidebar-label">{e.name || '(unknown)'}</span>
                <span className="sidebar-count">{e.count}</span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="main">
          {/* Toolbar */}
          <div className="toolbar">
            {error && <div role="alert" style={{ width: '100%', color: 'var(--red)' }}>{error} <button className="btn" onClick={() => setError('')}>Dismiss</button></div>}
            <button className="btn" disabled={exporting} onClick={() => handleExport('json')}>Export JSON</button>
            <button className="btn" disabled={exporting} onClick={() => handleExport('ndjson')}>Export NDJSON</button>
            <form className="search-box" onSubmit={handleSearchSubmit}>
              <span style={{ color: 'var(--muted)' }}>⌕</span>
              <input
                placeholder="Search all fields…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <span
                  style={{ cursor: 'pointer', color: 'var(--muted)' }}
                  onClick={() => { setSearchInput(''); setSearch(''); }}
                >✕</span>
              )}
            </form>

            <select
              className="filter-select"
              value={filterMsgType}
              onChange={e => setFilterMsgType(e.target.value)}
            >
              <option value="">All types</option>
              {msgTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <input
              className="filter-input"
              type="datetime-local"
              value={localDateInput(filterFrom)}
              onChange={e => setFilterFrom(e.target.value ? new Date(e.target.value).toISOString() : '')}
              title="From date"
              placeholder="From"
            />
            <input
              className="filter-input"
              type="datetime-local"
              value={localDateInput(filterTo)}
              onChange={e => setFilterTo(e.target.value ? new Date(e.target.value).toISOString() : '')}
              title="To date"
              placeholder="To"
            />

            <select
              className="filter-select"
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            >
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
            </select>

            {hasFilters && (
              <button className="btn" onClick={resetFilters}>✕ Clear filters</button>
            )}
          </div>

          <div className="content">
            {/* Table */}
            <div className="table-wrap">
              {loading ? (
                <div className="loading"><div className="dot-spin" /> Loading…</div>
              ) : messages.length === 0 ? (
                <div className="loading" style={{ flexDirection: 'column', paddingTop: 80 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  <div>No messages yet.</div>
                  <div style={{ fontSize: 11 }}>POST JSON to <code style={{ color: 'var(--accent)' }}>http://&lt;host&gt;:3001/</code></div>
                </div>
              ) : (
                <table>
                  <thead>
                    {table.getHeaderGroups().map(hg => (
                      <tr key={hg.id}>
                        {hg.headers.map(h => {
                          const sorted = h.column.getIsSorted();
                          return (
                            <th
                              key={h.id}
                              className={sorted ? 'sorted' : ''}
                              style={{ width: h.getSize() }}
                              onClick={h.column.getToggleSortingHandler()}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              <span className="sort-icon">
                                {sorted === 'asc' ? '↑' : sorted === 'desc' ? '↓' : '↕'}
                              </span>
                            </th>
                          );
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map(row => (
                      <tr
                        key={row.original.id}
                        className={selectedId === row.original.id ? 'selected' : ''}
                        onClick={() => setSelectedId(
                          selectedId === row.original.id ? null : row.original.id
                        )}
                      >
                        {row.getVisibleCells().map(cell => (
                          <td key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Detail panel */}
            <aside className="detail-panel">
              {!selectedId ? (
                <div className="detail-empty">
                  <span style={{ fontSize: 28 }}>←</span>
                  <span>Select a message to inspect</span>
                </div>
              ) : detailLoading ? (
                <div className="detail-empty"><div className="dot-spin" /> Loading…</div>
              ) : detail ? (
                <>
                  <div className="detail-header">
                    <h3 title={detail.name}>{detail.name || '(no name)'}</h3>
                    <button className="btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => setSelectedId(null)}>✕</button>
                  </div>
                  <div className="detail-meta">
                    {[
                      ['Frame ID',    detail.frame_id],
                      ['Source',      detail.source],
                      ['Received',    fmtTime(detail.received_at)],
                      ['Event Time',  fmtTime(detail.event_time)],
                      ['Type',        detail.msg_type],
                      ['Event Type',  detail.event_type],
                      ['Source IP',   detail.source_ip],
                      ['DB ID',       `#${detail.id}`],
                    ].map(([label, val]) => (
                      <div className="meta-item" key={label}>
                        <span className="meta-label">{label}</span>
                        <span className="meta-value" title={val}>{val || '—'}</span>
                      </div>
                    ))}
                  </div>
                  <div className="detail-json">
                    <JsonViewer data={detail.raw_json} />
                  </div>
                </>
              ) : null}
            </aside>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <div className="pagination-info">
              {total > 0
                ? `Showing ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, total).toLocaleString()} of ${total.toLocaleString()} messages`
                : 'No messages'}
              {hasFilters && <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 11 }}>(filtered)</span>}
            </div>
            <button className="pag-btn" onClick={() => setPage(1)} disabled={page <= 1}>«</button>
            <button className="pag-btn" onClick={() => setPage(p => p - 1)} disabled={page <= 1}>‹</button>
            <span style={{ color: 'var(--text)' }}>Page {page} / {totalPages || 1}</span>
            <button className="pag-btn" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>›</button>
            <button className="pag-btn" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>»</button>
          </div>
        </main>
      </div>
    </>
  );
}
