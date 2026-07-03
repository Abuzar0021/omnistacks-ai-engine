import { useEffect, useState } from 'react';
import { apiFetch } from './api/client';

type ApiStatus = 'checking' | 'online' | 'offline';

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    apiFetch<{ status: string }>('/health')
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'));
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">
          OmniStacks<span className="logo-accent">AI</span>
        </h1>
        <nav className="nav">
          {/* Placeholder navigation — pages live in src/pages/ */}
          <span className="nav-item nav-item-active">Dashboard</span>
          <span className="nav-item">Campaigns</span>
          <span className="nav-item">Leads</span>
          <span className="nav-item">Workflows</span>
          <span className="nav-item">Settings</span>
        </nav>
      </aside>

      <main className="content">
        <header className="content-header">
          <h2>Dashboard</h2>
          <span className={`status-pill status-${apiStatus}`}>API: {apiStatus}</span>
        </header>

        <section className="card">
          <h3>Scaffold ready</h3>
          <p>
            This is the OmniStacks AI Engine frontend shell. Feature pages belong in{' '}
            <code>src/pages/</code>, shared UI in <code>src/components/</code>, and API access goes
            through <code>src/api/client.ts</code>.
          </p>
        </section>
      </main>
    </div>
  );
}
