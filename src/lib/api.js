/**
 * API client for Sahyog backend.
 * Uses Clerk session token for Authorization. getToken must be passed from Clerk useAuth().
 */
import { getApiBaseUrl } from './network';

const getBaseUrl = () => getApiBaseUrl();

export async function apiRequest(path, options = {}, getToken) {
  const base = getBaseUrl();
  const query = options.query || null;
  const pathWithQuery =
    query && typeof query === 'object'
      ? `${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams(query).toString()}`
      : path;
  const url = pathWithQuery.startsWith('http') ? pathWithQuery : `${base}${pathWithQuery}`;
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (getToken) {
    try {
      const token = await getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch (e) {
      console.warn('Could not get auth token', e);
    }
  }
  const { query: _ignoredQuery, ...fetchOptions } = options;
  const res = await fetch(url, { ...fetchOptions, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    let msg = data.message || res.statusText || 'Request failed';
    if (data.errors && Array.isArray(data.errors)) {
      msg += ' - ' + data.errors.map(e => e.message).join(', ');
    }
    const err = new Error(msg);
    err.status = res.status;
    err.details = data.details ?? data;
    err.detail = data.detail ?? data.details?.detail;
    throw err;
  }
  return data;
}

export async function pingBackend() {
  const base = getBaseUrl();
  const url = base ? `${base.replace(/\/$/, '')}${apiPaths.health}` : apiPaths.health;
  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json().catch(() => ({}));
    return res.ok && data?.ok === true;
  } catch (e) {
    console.warn('Backend ping failed:', e?.message || e);
    return false;
  }
}

export const apiPaths = {
  health: '/api/health',
  me: '/api/users/me',
  users: '/api/users',
  userRole: (uid) => `/api/users/${uid}/role`,

  needs: '/api/v1/needs',
  needAssign: (id) => `/api/v1/needs/${id}/assign`,
  needResolve: (id) => `/api/v1/needs/${id}/resolve`,
  sos: '/api/v1/sos',
  sosDetail: (id) => `/api/v1/sos/${id}`,
  sosTasks: (id) => `/api/v1/sos/${id}/tasks`,

  disasters: '/api/v1/disasters',
  disasterById: (id) => `/api/v1/disasters/${id}`,
  disasterActivate: (id) => `/api/v1/disasters/${id}/activate`,
  disasterResolve: (id) => `/api/v1/disasters/${id}/resolve`,
  disasterTasks: (id) => `/api/v1/disasters/${id}/tasks`,
  disasterStats: (id) => `/api/v1/disasters/${id}/stats`,

  zones: '/api/v1/zones',
  zoneAssign: (id) => `/api/v1/zones/${id}/coordinator`,
  zonesSummary: '/api/v1/zones/summary',
  zonesGeojson: '/api/v1/zones/geojson',

  tasks: '/api/v1/tasks/pending',
  createTask: '/api/v1/tasks',
  updateTaskStatus: (id) => `/api/v1/tasks/${id}/status`,
  tasksEscalated: '/api/v1/tasks/escalated',

  resources: '/api/v1/resources',
  inventoryLocations: '/api/v1/inventory/locations',
  ambulanceRoute: '/api/v1/inventory/ambulance-route',

  missing: '/api/v1/missing',
  markFound: (id) => `/api/v1/missing/${id}/found`,
  activeNeeds: '/api/v1/needs/active',

  serverStats: '/api/v1/server/stats',
  search: (query) => `/api/v1/search?q=${encodeURIComponent(query)}`,
  volunteerLocations: '/api/v1/volunteers/locations',
  coordinatorsMetrics: '/api/v1/coordinator/metrics',
  disasterReport: (id) => `/api/v1/disasters/${id}/report`,

  // Live locations (Redis)
  locations: '/api/v1/locations/all',
  locationsFull: '/api/v1/locations/all/full',
  locationsNearby: '/api/v1/locations/nearby',
  locationUpdate: '/api/v1/locations/update',

  // Organization endpoints
  orgRegister: '/api/v1/organizations/register',
  orgMe: '/api/v1/organizations/me',
  orgStats: '/api/v1/organizations/me/stats',
  orgVolunteers: '/api/v1/organizations/me/volunteers',
  orgLinkVolunteer: (userId) => `/api/v1/organizations/me/volunteers/${userId}`,
  orgResources: '/api/v1/organizations/me/resources',
  orgTasks: '/api/v1/organizations/me/tasks',
  orgZones: '/api/v1/organizations/me/zones',
  orgRequests: '/api/v1/organizations/me/requests',
  orgAcceptRequest: (assignmentId) => `/api/v1/organizations/me/requests/${assignmentId}/accept`,
  orgRejectRequest: (assignmentId) => `/api/v1/organizations/me/requests/${assignmentId}/reject`,
  orgAssignCoordinator: (assignmentId) => `/api/v1/organizations/me/requests/${assignmentId}/assign-coordinator`,

  // SOS alerts
  sos: '/api/v1/sos',

  // Volunteer assignments
  myAssignments: '/api/v1/volunteer-assignments/mine',
  respondAssignment: (id) => `/api/v1/volunteer-assignments/${id}/respond`,

  // Admin workflows
  adminReassignTasks: '/api/v1/admin/workflows/reassign-tasks',
  adminDeactivateVolunteer: (id) => `/api/v1/admin/workflows/volunteers/${id}/deactivate`,
  adminFreezeZone: (id) => `/api/v1/admin/workflows/zones/${id}/freeze`,
};
