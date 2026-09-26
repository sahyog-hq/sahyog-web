import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, SignIn, SignUp } from '@clerk/clerk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import { store } from './store';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { OrgLayout } from './components/OrgLayout';
import { RealtimeProvider } from './components/RealtimeProvider';
import { Dashboard } from './pages/Dashboard';
import { SosList } from './pages/SosList';
import { UnifiedOrchestratorDashboard } from './pages/UnifiedOrchestratorDashboard';
import { DisastersList } from './pages/DisastersList';
import { VolunteersList } from './pages/VolunteersList';
import { SheltersList } from './pages/SheltersList';
import { MissingList } from './pages/MissingList';
import { UsersList } from './pages/UsersList';
import { ServerMonitor } from './pages/ServerMonitor';
import { ReliefCoordination } from './pages/ReliefCoordination';
import { LiveMap } from './pages/LiveMap';
import { PublicHeatmap } from './pages/PublicHeatmap';
import { OrgOnboarding } from './pages/org/OrgOnboarding';
import { OrgDashboard } from './pages/org/OrgDashboard';
import { OrgVolunteers } from './pages/org/OrgVolunteers';
import { OrgResources } from './pages/org/OrgResources';
import { OrgTasks } from './pages/org/OrgTasks';
import { OrgZones } from './pages/org/OrgZones';
import { OrgProfile } from './pages/org/OrgProfile';
import { OrgRequests } from './pages/org/OrgRequests';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CommandDashboard } from './pages/command-center/CommandDashboard';
import { ZonesPage } from './pages/command-center/ZonesPage';
import { ZoneDetailsPage } from './pages/command-center/ZoneDetailsPage';
import { EscalationsPage } from './pages/command-center/EscalationsPage';
import { DeploymentMapPage } from './pages/command-center/DeploymentMapPage';
import { CoordinatorAnalyticsPage } from './pages/command-center/CoordinatorAnalyticsPage';
import { ReportsPage } from './pages/command-center/ReportsPage';
import AdminAuditLogs from './pages/AdminAuditLogs';
import { OrgActivityLog } from './pages/org/OrgActivityLog';
import FleetPortal from './pages/FleetPortal';
import FleetTracker from './pages/FleetTracker';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  console.warn('Missing VITE_CLERK_PUBLISHABLE_KEY. Set it in .env for Clerk auth.');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const clerkAppearance = {
  variables: {
    colorPrimary: '#34b27b',
    colorText: '#0f172a',
    colorBackground: '#ffffff',
    colorInputBackground: '#f6f8f7',
    colorInputText: '#0f172a',
    borderRadius: '12px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  elements: {
    rootBox: {
      width: '100%',
      maxWidth: '400px',
    },
    card: {
      border: '1px solid #e2e8f0',
      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.06), 0 8px 10px -6px rgba(0,0,0,0.04)',
      borderRadius: '1.5rem',
    },
    headerTitle: {
      fontSize: '20px',
      fontWeight: '800',
    },
    formButtonPrimary: {
      backgroundColor: '#34b27b',
      fontSize: '14px',
      fontWeight: '700',
      borderRadius: '12px',
      textTransform: 'none',
      padding: '11px 16px',
    },
    formFieldInput: {
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      fontSize: '14px',
    },
    footer: { display: 'none' },
    socialButtonsBlockButton: {
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
    },
  },
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route path="/public-heatmap" element={<PublicHeatmap />} />
      <Route path="/drive" element={<FleetPortal />} />
      <Route
        path="/"
        element={
          <ProtectedRoute allowedRoles={['admin', 'coordinator', 'volunteer', 'user', 'organization', 'vehicle', 'driver']}>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="dashboard" element={<Navigate to="/zones" replace />} />
        <Route path="orchestrator" element={<UnifiedOrchestratorDashboard />} />
        <Route path="zones" element={<ZonesPage />} />
        <Route path="zones/:id" element={<ZoneDetailsPage />} />
        <Route path="escalations" element={<EscalationsPage />} />
        <Route path="coordinators" element={<CoordinatorAnalyticsPage />} />
        <Route path="reports" element={<ReportsPage />} />

        <Route path="needs" element={<SosList />} />
        <Route path="sos" element={<SosList />} />
        <Route path="disasters" element={<DisastersList />} />
        <Route path="resources" element={<SheltersList />} />
        <Route path="volunteers" element={<VolunteersList />} />
        <Route path="shelters" element={<SheltersList />} />
        <Route path="missing" element={<MissingList />} />
        <Route path="users" element={<UsersList />} />
        <Route path="relief" element={<ReliefCoordination />} />
        <Route path="map" element={<DeploymentMapPage />} />
        <Route path="live-map" element={<Navigate to="/map" replace />} />
        <Route path="server" element={<ServerMonitor />} />
        <Route path="audit-logs" element={<AdminAuditLogs />} />
        <Route path="command" element={<CommandDashboard />} />
        <Route path="fleet-tracking" element={<FleetTracker />} />
      </Route>

      {/* Organization Onboarding — open to any authenticated user */}
      <Route
        path="/org-onboarding"
        element={
          <ProtectedRoute allowedRoles={['volunteer', 'organization', 'admin', 'coordinator', 'user']}>
            <OrgOnboarding />
          </ProtectedRoute>
        }
      />

      {/* Organization Panel */}
      <Route
        path="/org"
        element={
          <ProtectedRoute allowedRoles={['organization']}>
            <OrgLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OrgDashboard />} />
        <Route path="requests" element={<OrgRequests />} />
        <Route path="volunteers" element={<OrgVolunteers />} />
        <Route path="resources" element={<OrgResources />} />
        <Route path="tasks" element={<OrgTasks />} />
        <Route path="zones" element={<OrgZones />} />
        <Route path="profile" element={<OrgProfile />} />
        <Route path="activity-log" element={<OrgActivityLog />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/* ─── Auth mode content config ──────────────────────────────────── */
const authModes = {
  admin: {
    icon: 'admin_panel_settings',
    iconColor: '#34b27b',
    tagline: 'Emergency Response Command Portal',
    heroTitle: <>Rapid coordination.<br />Real-time intelligence.<br />Lives saved.</>,
    heroDesc: 'Secure access for emergency responders, volunteers, and coordinators. Monitor SOS alerts, deploy teams, and manage disaster zones.',
    features: [
      { icon: 'sos', color: '#34b27b', text: 'Real-time SOS Monitoring' },
      { icon: 'group', color: '#3b82f6', text: 'Volunteer Management' },
      { icon: 'flood', color: '#f59e0b', text: 'Disaster Zone Tracking' },
      { icon: 'security', color: '#ef4444', text: 'End-to-end Encryption' },
    ],
    signUpHero: <>Join the response<br />network today.</>,
    signUpDesc: 'Create your account to access the disaster response platform. Coordinate with teams, manage resources, and save lives.',
    signUpFeatures: [
      { icon: 'verified', color: '#34b27b', text: 'Verified Access' },
      { icon: 'lock', color: '#3b82f6', text: '256-bit Encryption' },
    ],
  },
  org: {
    icon: 'apartment',
    iconColor: '#3b82f6',
    tagline: 'Organization Management Portal',
    heroTitle: <>Manage your relief<br />operations from<br />one dashboard.</>,
    heroDesc: 'Register your NGO or relief agency. Track resources, coordinate volunteers, and monitor disaster response operations efficiently.',
    features: [
      { icon: 'inventory_2', color: '#10b981', text: 'Resource Management' },
      { icon: 'group', color: '#3b82f6', text: 'Volunteer Coordination' },
      { icon: 'task_alt', color: '#f59e0b', text: 'Task Monitoring' },
      { icon: 'map', color: '#8b5cf6', text: 'Zone Assignment' },
    ],
    signUpHero: <>Register your<br />organization today.</>,
    signUpDesc: 'Create an account and set up your organization profile. Start managing relief resources and coordinating response efforts.',
    signUpFeatures: [
      { icon: 'apartment', color: '#3b82f6', text: 'Full Organization Dashboard' },
      { icon: 'verified', color: '#10b981', text: 'Verified Org Accounts' },
    ],
  },
};

function SignInPage() {
  const [mode, setMode] = useState(() => localStorage.getItem('loginIntent') || 'admin');
  const m = authModes[mode];

  const handleMode = (newMode) => {
    setMode(newMode);
    localStorage.setItem('loginIntent', newMode);
  };

  return (
    <div style={authStyles.wrapper}>
      <div style={authStyles.left}>
        <div style={authStyles.leftInner} key={mode}>
          <div style={authStyles.brand}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: m.iconColor, fontWeight: 700 }}>emergency</span>
            <h1 style={authStyles.brandText}>RESQCONNECT</h1>
          </div>

          <p style={authStyles.tagline}>{m.tagline}</p>

          <h2 style={{ ...authStyles.heroTitle, animation: 'fadeSlideIn 0.4s ease-out' }}>
            {m.heroTitle}
          </h2>

          <p style={{ ...authStyles.heroDesc, animation: 'fadeSlideIn 0.4s ease-out 0.05s both' }}>
            {m.heroDesc}
          </p>

          <div style={{ ...authStyles.features, animation: 'fadeSlideIn 0.4s ease-out 0.1s both' }}>
            {m.features.map(f => (
              <div style={authStyles.featureItem} key={f.text}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: f.color }}>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={authStyles.right}>
        {/* Toggle */}
        <div style={toggleStyles.row}>
          <div style={{ ...toggleStyles.slider, left: mode === 'admin' ? '4px' : 'calc(50% - 0px)' }} />
          <button style={mode === 'admin' ? toggleStyles.btnActive : toggleStyles.btn} onClick={() => handleMode('admin')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>admin_panel_settings</span>
            Admin
          </button>
          <button style={mode === 'org' ? toggleStyles.btnActive : toggleStyles.btn} onClick={() => handleMode('org')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apartment</span>
            Organization
          </button>
        </div>

        {/* Form label */}
        <div key={mode + '-label'} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, animation: 'fadeScale 0.3s ease-out' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: m.iconColor }}>{m.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {mode === 'admin' ? 'Admin / Coordinator' : 'Organization Portal'}
          </span>
        </div>

        <SignIn
          signUpUrl="/sign-up"
          afterSignInUrl={mode === 'org' ? '/org-onboarding' : '/'}
          signInFallbackRedirectUrl={mode === 'org' ? '/org-onboarding' : '/'}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  const [mode, setMode] = useState(() => localStorage.getItem('loginIntent') || 'admin');
  const m = authModes[mode];

  const handleMode = (newMode) => {
    setMode(newMode);
    localStorage.setItem('loginIntent', newMode);
  };

  return (
    <div style={authStyles.wrapper}>
      <div style={authStyles.left}>
        <div style={authStyles.leftInner} key={mode}>
          <div style={authStyles.brand}>
            <span className="material-symbols-outlined" style={{ fontSize: 32, color: m.iconColor, fontWeight: 700 }}>emergency</span>
            <h1 style={authStyles.brandText}>RESQCONNECT</h1>
          </div>

          <p style={authStyles.tagline}>{m.tagline}</p>

          <h2 style={{ ...authStyles.heroTitle, animation: 'fadeSlideIn 0.4s ease-out' }}>
            {m.signUpHero}
          </h2>

          <p style={{ ...authStyles.heroDesc, animation: 'fadeSlideIn 0.4s ease-out 0.05s both' }}>
            {m.signUpDesc}
          </p>

          <div style={{ ...authStyles.features, animation: 'fadeSlideIn 0.4s ease-out 0.1s both' }}>
            {m.signUpFeatures.map(f => (
              <div style={authStyles.featureItem} key={f.text}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: f.color }}>{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={authStyles.right}>
        {/* Toggle */}
        <div style={toggleStyles.row}>
          <div style={{ ...toggleStyles.slider, left: mode === 'admin' ? '4px' : 'calc(50% - 0px)' }} />
          <button style={mode === 'admin' ? toggleStyles.btnActive : toggleStyles.btn} onClick={() => handleMode('admin')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>admin_panel_settings</span>
            Admin
          </button>
          <button style={mode === 'org' ? toggleStyles.btnActive : toggleStyles.btn} onClick={() => handleMode('org')}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>apartment</span>
            Organization
          </button>
        </div>

        {/* Form label */}
        <div key={mode + '-label'} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, animation: 'fadeScale 0.3s ease-out' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: m.iconColor }}>{m.icon}</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {mode === 'admin' ? 'Register as Responder' : 'Register Organization'}
          </span>
        </div>

        <SignUp
          signInUrl="/sign-in"
          afterSignUpUrl={mode === 'org' ? '/org-onboarding' : '/'}
          signUpFallbackRedirectUrl={mode === 'org' ? '/org-onboarding' : '/'}
          appearance={clerkAppearance}
        />
      </div>
    </div>
  );
}

/* ─── Toggle pill styles ──────────────────────────────────────────── */
const toggleStyles = {
  row: {
    position: 'relative',
    display: 'flex',
    background: '#fff',
    padding: 4,
    borderRadius: 16,
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
    marginBottom: 20,
    width: '100%',
    maxWidth: 400,
  },
  slider: {
    position: 'absolute',
    top: 4,
    width: 'calc(50% - 4px)',
    height: 'calc(100% - 8px)',
    background: 'linear-gradient(135deg, #34b27b, #059669)',
    borderRadius: 12,
    transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 2px 8px rgba(52, 178, 123, 0.3)',
  },
  btn: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 8px',
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 12,
    transition: 'color 0.25s',
  },
  btnActive: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 8px',
    border: 'none',
    background: 'transparent',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    borderRadius: 12,
    transition: 'color 0.25s',
  },
};

const authStyles = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  left: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    background: '#ffffff',
    borderRight: '1px solid #e2e8f0',
  },
  leftInner: {
    maxWidth: '480px',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '24px',
  },
  brandText: {
    fontSize: '18px',
    fontWeight: '900',
    letterSpacing: '-0.5px',
    color: '#0f172a',
    margin: 0,
  },
  tagline: {
    fontSize: '11px',
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '2px',
    margin: '0 0 32px',
  },
  heroTitle: {
    fontSize: '34px',
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: '1.15',
    margin: '0 0 16px',
    letterSpacing: '-0.5px',
  },
  heroDesc: {
    fontSize: '14px',
    color: '#64748b',
    lineHeight: '1.65',
    margin: '0 0 36px',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    background: '#f6f8f7',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    fontSize: '13px',
    fontWeight: '600',
    color: '#334155',
  },
  right: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    background: '#f6f8f7',
  },
};

export default function App() {
  return (
    <ClerkProvider
      publishableKey={publishableKey || ''}
      afterSignOutUrl="/sign-in"
    >
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <ErrorBoundary>
            <BrowserRouter>
              <RealtimeProvider>
                <AppRoutes />
              </RealtimeProvider>
            </BrowserRouter>
          </ErrorBoundary>
        </QueryClientProvider>
      </Provider>
    </ClerkProvider>
  );
}
