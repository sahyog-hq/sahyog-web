import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SignedIn, SignedOut, useClerk } from '@clerk/clerk-react';
import { useMe } from '../api/hooks';

function RoleGate({ children, allowedRoles }) {
  const { data: me, isLoading, error } = useMe();
  const { signOut } = useClerk();
  const location = useLocation();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div style={gateStyles.center}>
        <div style={gateStyles.spinner} />
        <p style={gateStyles.loadText}>Verifying access…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={gateStyles.center}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#ef4444' }}>error</span>
        <h2 style={gateStyles.title}>Authentication Error</h2>
        <p style={gateStyles.desc}>{error.message}</p>
        <button style={gateStyles.btn} onClick={() => signOut()}>Sign Out</button>
      </div>
    );
  }

  const role = me?.role;
  const loginIntent = typeof window !== 'undefined' ? localStorage.getItem('loginIntent') : null;

  if (role === 'vehicle' || role === 'driver') {
    if (location.pathname !== '/drive' && location.pathname !== '/fleet-tracking') {
      return <Navigate to="/drive" replace />;
    }
  }

  // ─── Intent / Role Handling ──────────────────────────────────
  // If user is organization role and trying to access an org-only route, allow them.
  // If user is accessing main portal with 'organization' role, allow them if allowedRoles includes 'organization'.

  // ─── Normal role-based routing ────────────────────────────────
  // Organization role → redirect to org panel (or onboarding)
  if (role === 'organization' && !allowedRoles?.includes('organization')) {
    if (me?.organization_id) {
      return <Navigate to="/org" replace />;
    }
    return <Navigate to="/org-onboarding" replace />;
  }

  // Volunteer/new user with organization intent → redirect to org onboarding
  if (role !== 'admin' && role !== 'organization' && loginIntent === 'org' && !allowedRoles?.includes(role)) {
    return <Navigate to="/org-onboarding" replace />;
  }

  // Admin role accessing org routes → redirect to admin
  if (role === 'admin' && allowedRoles?.includes('organization') && !allowedRoles?.includes('admin')) {
    return <Navigate to="/" replace />;
  }

  // Check if user role is allowed
  if (allowedRoles && !allowedRoles.includes(role)) {
    return (
      <div style={gateStyles.center}>
        <span className="material-symbols-outlined" style={{ fontSize: 56, color: '#ef4444' }}>shield_lock</span>
        <h2 style={gateStyles.title}>Access Denied</h2>
        <p style={gateStyles.desc}>
          You don't have permission to access this section.
        </p>
        <p style={gateStyles.roleInfo}>
          Your current role: <code style={gateStyles.roleCode}>{role || 'user'}</code>
        </p>
        <p style={gateStyles.hint}>
          Contact an administrator to request elevated privileges.
        </p>
        <button style={gateStyles.btn} onClick={() => signOut()}>Sign Out</button>
      </div>
    );
  }

  return children;
}

const gateStyles = {
  center: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: "'Inter', system-ui, sans-serif",
    background: '#f8fafc',
    padding: '24px',
    textAlign: 'center',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #e2e8f0',
    borderTopColor: '#34b27b',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadText: {
    marginTop: 16,
    fontSize: 14,
    color: '#64748b',
    fontWeight: 500,
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    color: '#0f172a',
    margin: '16px 0 8px',
  },
  desc: {
    fontSize: 15,
    color: '#475569',
    margin: '0 0 8px',
    maxWidth: 400,
    lineHeight: 1.5,
  },
  roleInfo: {
    fontSize: 13,
    color: '#64748b',
    margin: '4px 0 16px',
  },
  roleCode: {
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
  },
  hint: {
    fontSize: 13,
    color: '#94a3b8',
    margin: '0 0 20px',
  },
  btn: {
    padding: '10px 28px',
    fontSize: 14,
    fontWeight: 700,
    color: '#fff',
    background: '#ef4444',
    border: 'none',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
};

export function ProtectedRoute({ children, allowedRoles = ['admin', 'coordinator', 'volunteer', 'user'] }) {
  const location = useLocation();
  return (
    <>
      <SignedIn>
        <RoleGate allowedRoles={allowedRoles}>{children}</RoleGate>
      </SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" state={{ from: location }} replace />
      </SignedOut>
    </>
  );
}

