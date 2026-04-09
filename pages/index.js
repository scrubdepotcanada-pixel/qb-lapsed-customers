// pages/index.js
import { useState, useEffect } from 'react';

const DEFAULT_EXCLUDES = ['cdi', 'vcc', 'reeves'];

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [months, setMonths] = useState(18);
  const [minAmount, setMinAmount] = useState(500);
  const [excludes, setExcludes] = useState([]);
  const [newExclude, setNewExclude] = useState('');
  const [showExcludes, setShowExcludes] = useState(false);

  useEffect(() => {
    checkStatus();
    loadExcludes();
    if (window.location.search.includes('connected=true')) {
      setConnected(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  async function checkStatus() {
    try {
      const res = await fetch('/api/qb/status');
      const data = await res.json();
      setConnected(data.connected);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadExcludes() {
    try {
      const res = await fetch('/api/qb/excludes');
      const data = await res.json();
      if (data.excludes && data.excludes.length > 0) {
        setExcludes(data.excludes);
      } else {
        // Set defaults on first load
        await fetch('/api/qb/excludes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set', excludes: DEFAULT_EXCLUDES }),
        });
        setExcludes(DEFAULT_EXCLUDES);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function addExclude() {
    if (!newExclude.trim()) return;
    try {
      const res = await fetch('/api/qb/excludes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', keyword: newExclude }),
      });
      const data = await res.json();
      setExcludes(data.excludes);
      setNewExclude('');
    } catch (e) {
      console.error(e);
    }
  }

  async function removeExclude(keyword) {
    try {
      const res = await fetch('/api/qb/excludes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', keyword }),
      });
      const data = await res.json();
      setExcludes(data.excludes);
    } catch (e) {
      console.error(e);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(
        `/api/qb/lapsed-customers?months=${months}&min_amount=${minAmount}&format=xlsx`
      );
      if (res.status === 401) {
        setConnected(false);
        setError('Session expired. Please reconnect to QuickBooks.');
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lapsed-customers-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      setResult({ type: 'excel', message: 'Excel file downloaded!' });
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  async function handlePreviewJSON() {
    setExporting(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch(
        `/api/qb/lapsed-customers?months=${months}&min_amount=${minAmount}&format=json`
      );
      if (res.status === 401) {
        setConnected(false);
        setError('Session expired. Please reconnect to QuickBooks.');
        return;
      }
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Query failed');
      }
      const data = await res.json();
      setResult({ type: 'json', data });
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loadingText}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>Lapsed Customer Export</h1>
          <p style={styles.subtitle}>Scrub Depot Canada — QuickBooks Online</p>
        </div>

        {!connected ? (
          <div style={styles.connectSection}>
            <p style={styles.connectText}>
              Connect to QuickBooks to pull your customer and invoice data.
            </p>
            <a href="/api/qb/auth" style={styles.connectBtn}>
              Connect to QuickBooks
            </a>
          </div>
        ) : (
          <div>
            <div style={styles.statusBar}>
              <span style={styles.statusDot} />
              <span style={styles.statusText}>Connected to QuickBooks</span>
            </div>

            <div style={styles.filtersSection}>
              <h3 style={styles.filtersTitle}>Filters</h3>
              <div style={styles.filterRow}>
                <div style={styles.filterGroup}>
                  <label style={styles.label}>Inactive for (months)</label>
                  <input
                    type="number"
                    value={months}
                    onChange={(e) => setMonths(parseInt(e.target.value) || 18)}
                    style={styles.input}
                    min={1}
                  />
                </div>
                <div style={styles.filterGroup}>
                  <label style={styles.label}>Min last order ($)</label>
                  <input
                    type="number"
                    value={minAmount}
                    onChange={(e) => setMinAmount(parseFloat(e.target.value) || 500)}
                    style={styles.input}
                    min={0}
                  />
                </div>
              </div>

              {/* Exclude List */}
              <div style={{ marginTop: '16px' }}>
                <button
                  onClick={() => setShowExcludes(!showExcludes)}
                  style={styles.toggleBtn}
                >
                  {showExcludes ? '▾' : '▸'} Exclude List ({excludes.length})
                </button>

                {showExcludes && (
                  <div style={styles.excludeSection}>
                    <p style={styles.excludeHint}>
                      Customers matching these keywords will be excluded from results
                    </p>
                    <div style={styles.excludeTags}>
                      {excludes.map((kw) => (
                        <span key={kw} style={styles.tag}>
                          {kw}
                          <button
                            onClick={() => removeExclude(kw)}
                            style={styles.tagRemove}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <div style={styles.addExcludeRow}>
                      <input
                        type="text"
                        value={newExclude}
                        onChange={(e) => setNewExclude(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addExclude()}
                        placeholder="Add keyword to exclude..."
                        style={{ ...styles.input, flex: 1 }}
                      />
                      <button onClick={addExclude} style={styles.addBtn}>
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={styles.actions}>
              <button
                onClick={handleExportExcel}
                disabled={exporting}
                style={{
                  ...styles.primaryBtn,
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                {exporting ? 'Pulling data...' : 'Download Excel'}
              </button>
              <button
                onClick={handlePreviewJSON}
                disabled={exporting}
                style={{
                  ...styles.secondaryBtn,
                  opacity: exporting ? 0.6 : 1,
                }}
              >
                {exporting ? 'Pulling data...' : 'Preview Data'}
              </button>
            </div>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {result?.type === 'excel' && (
          <div style={styles.success}>{result.message}</div>
        )}

        {result?.type === 'json' && (
          <div style={styles.resultsSection}>
            <div style={styles.statsRow}>
              <div style={styles.stat}>
                <span style={styles.statNumber}>{result.data.totalCustomers}</span>
                <span style={styles.statLabel}>Total Customers</span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statNumber}>{result.data.totalInvoices}</span>
                <span style={styles.statLabel}>Invoices Scanned</span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statNumber}>{result.data.lapsedCount}</span>
                <span style={styles.statLabel}>Lapsed Found</span>
              </div>
            </div>

            {result.data.customers.length > 0 && (
              <div style={styles.tableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Name</th>
                      <th style={styles.th}>Email</th>
                      <th style={styles.th}>Company</th>
                      <th style={styles.thRight}>Total Spent</th>
                      <th style={styles.thRight}>Last Order</th>
                      <th style={styles.th}>Last Date</th>
                      <th style={styles.thRight}>Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.data.customers.map((c, i) => (
                      <tr key={i} style={i % 2 === 0 ? styles.rowEven : styles.rowOdd}>
                        <td style={styles.td}>{c.name}</td>
                        <td style={styles.td}>{c.email || '—'}</td>
                        <td style={styles.td}>{c.company || '—'}</td>
                        <td style={styles.tdRight}>
                          ${c.totalSpent.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={styles.tdRight}>
                          ${c.lastOrderAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={styles.td}>{c.lastOrderDate}</td>
                        <td style={styles.tdRight}>{c.daysSinceLastOrder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.data.customers.length === 0 && (
              <p style={styles.noResults}>
                No lapsed customers found matching your filters. Try adjusting the months or minimum amount.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f0f1a',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '40px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#1a1a2e',
    borderRadius: '12px',
    padding: '40px',
    maxWidth: '1000px',
    width: '100%',
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  },
  header: { marginBottom: '32px' },
  title: { color: '#fff', fontSize: '28px', margin: 0, fontWeight: 700 },
  subtitle: { color: '#888', fontSize: '14px', marginTop: '4px' },
  loadingText: { color: '#888', textAlign: 'center' },
  connectSection: { textAlign: 'center', padding: '40px 0' },
  connectText: { color: '#aaa', marginBottom: '24px', fontSize: '16px' },
  connectBtn: {
    display: 'inline-block',
    background: '#2ca01c',
    color: '#fff',
    padding: '14px 32px',
    borderRadius: '8px',
    textDecoration: 'none',
    fontWeight: 600,
    fontSize: '16px',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '24px',
    padding: '12px 16px',
    background: 'rgba(44, 160, 28, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(44, 160, 28, 0.3)',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#2ca01c',
  },
  statusText: { color: '#2ca01c', fontSize: '14px', fontWeight: 500 },
  filtersSection: { marginBottom: '24px' },
  filtersTitle: { color: '#ccc', fontSize: '14px', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' },
  filterRow: { display: 'flex', gap: '16px', flexWrap: 'wrap' },
  filterGroup: { flex: '1', minWidth: '160px' },
  label: { display: 'block', color: '#888', fontSize: '12px', marginBottom: '6px' },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: '#0f0f1a',
    border: '1px solid #333',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '13px',
    padding: '4px 0',
    fontWeight: 500,
  },
  excludeSection: {
    marginTop: '10px',
    padding: '16px',
    background: '#0f0f1a',
    borderRadius: '8px',
    border: '1px solid #333',
  },
  excludeHint: {
    color: '#666',
    fontSize: '12px',
    marginBottom: '12px',
  },
  excludeTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    marginBottom: '12px',
  },
  tag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: '#2a2a4a',
    color: '#ccc',
    padding: '6px 12px',
    borderRadius: '20px',
    fontSize: '13px',
  },
  tagRemove: {
    background: 'none',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '16px',
    padding: 0,
    lineHeight: 1,
  },
  addExcludeRow: {
    display: 'flex',
    gap: '8px',
  },
  addBtn: {
    padding: '10px 20px',
    background: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
  },
  actions: { display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' },
  primaryBtn: {
    padding: '12px 28px',
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
  },
  secondaryBtn: {
    padding: '12px 28px',
    background: 'transparent',
    color: '#4f46e5',
    border: '1px solid #4f46e5',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '14px',
  },
  error: {
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px',
    color: '#ef4444',
    fontSize: '14px',
    marginBottom: '16px',
  },
  success: {
    padding: '12px 16px',
    background: 'rgba(44, 160, 28, 0.1)',
    border: '1px solid rgba(44, 160, 28, 0.3)',
    borderRadius: '8px',
    color: '#2ca01c',
    fontSize: '14px',
    marginBottom: '16px',
  },
  resultsSection: { marginTop: '8px' },
  statsRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '24px',
    flexWrap: 'wrap',
  },
  stat: {
    flex: '1',
    minWidth: '120px',
    background: '#0f0f1a',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'center',
  },
  statNumber: { display: 'block', color: '#fff', fontSize: '28px', fontWeight: 700 },
  statLabel: { display: 'block', color: '#888', fontSize: '12px', marginTop: '4px' },
  tableWrapper: { overflowX: 'auto' },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    color: '#888',
    borderBottom: '1px solid #333',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  thRight: {
    textAlign: 'right',
    padding: '10px 12px',
    color: '#888',
    borderBottom: '1px solid #333',
    fontWeight: 600,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  td: { padding: '10px 12px', color: '#ddd', borderBottom: '1px solid #1f1f35' },
  tdRight: { padding: '10px 12px', color: '#ddd', borderBottom: '1px solid #1f1f35', textAlign: 'right' },
  rowEven: { background: 'rgba(255,255,255,0.02)' },
  rowOdd: {},
  noResults: { color: '#888', textAlign: 'center', padding: '32px 0' },
};
