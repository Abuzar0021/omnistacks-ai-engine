import { NavLink, Route, Routes } from 'react-router-dom';
import { BusinessAuditDetailPage } from './pages/BusinessAuditDetailPage';
import { BusinessDetailPage } from './pages/BusinessDetailPage';
import { BusinessListPage } from './pages/BusinessListPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmailDraftDetailPage } from './pages/EmailDraftDetailPage';
import { ImportPage } from './pages/ImportPage';
import { WebsiteAnalysisDetailPage } from './pages/WebsiteAnalysisDetailPage';

function navClass({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-item nav-item-active' : 'nav-item';
}

export function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1 className="logo">
          OmniStacks<span className="logo-accent">AI</span>
        </h1>
        <nav className="nav">
          <NavLink to="/" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/businesses" className={navClass}>
            Businesses
          </NavLink>
          <NavLink to="/import" className={navClass}>
            Import CSV
          </NavLink>
        </nav>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/businesses" element={<BusinessListPage />} />
          <Route path="/businesses/:id" element={<BusinessDetailPage />} />
          <Route
            path="/businesses/:businessId/website-analyses/:analysisId"
            element={<WebsiteAnalysisDetailPage />}
          />
          <Route
            path="/businesses/:businessId/audits/:auditId"
            element={<BusinessAuditDetailPage />}
          />
          <Route
            path="/businesses/:businessId/email-drafts/:draftId"
            element={<EmailDraftDetailPage />}
          />
          <Route path="/import" element={<ImportPage />} />
          <Route path="*" element={<p className="text-muted">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
