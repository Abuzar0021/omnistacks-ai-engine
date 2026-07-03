import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api/client';

type ApiStatus = 'checking' | 'online' | 'offline';

export function DashboardPage() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    apiFetch<{ data: unknown }>('/health')
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'));
  }, []);

  return (
    <div>
      <header className="content-header">
        <h2>Dashboard</h2>
        <span className={`status-pill status-${apiStatus}`}>API: {apiStatus}</span>
      </header>

      <section className="card">
        <h3>Lead management is live</h3>
        <p>
          Manage your pipeline under <Link to="/businesses">Businesses</Link>, or bulk-load
          prospects via <Link to="/import">CSV import</Link>. Campaign analytics will appear here in
          a later milestone.
        </p>
      </section>
    </div>
  );
}
