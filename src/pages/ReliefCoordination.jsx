import { useState, useEffect, useRef, useCallback } from 'react';
import { useRealtime } from '../components/RealtimeProvider';
import { useDisastersList, useSosList, useUsersList } from '../api/hooks';
import {
  useReliefZones, useCreateZone, useDeleteZone,
  useDisasterRequests, useCreateRequest, useAllOrganizations,
  useInventoryLocations, useAmbulanceRoute,
} from '../api/useReliefCoordination';
import { MapContainer, TileLayer, Circle, Marker, Popup, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import styles from './DataList.module.css';

const SEVERITY_COLORS = { red: '#ef4444', yellow: '#f59e0b', blue: '#3b82f6' };
const SEVERITY_LABELS = { red: 'Emergency', yellow: 'Delayed Help', blue: 'Risk Area' };
const DEFAULT_ITEMS = [
  { resource_type: 'Water Bottles', quantity_needed: 100, is_default: true },
  { resource_type: 'Food Packets', quantity_needed: 100, is_default: true },
  { resource_type: 'Medical Supplies', quantity_needed: 100, is_default: true },
];

/* ─── Map click handler component ──────────────────────────── */
function MapClickHandler({ onMapClick, drawing }) {
  useMapEvents({
    click(e) { if (drawing) onMapClick(e.latlng); },
    mousemove() { },
  });
  return null;
}

function ZoomDisplay() {
  const map = useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
    },
  });
  const [zoom, setZoom] = useState(() => map.getZoom() || 11);

  const minZ = map.getMinZoom() || 3;
  const maxZ = map.getMaxZoom() || 18;
  const zoomPercent = Math.min(100, Math.max(10, Math.round(((zoom - minZ) / (maxZ - minZ)) * 90 + 10)));

  return (
    <div style={{
      position: 'absolute',
      bottom: '24px',
      left: '24px',
      zIndex: 1000,
      background: 'var(--color-surface, #ffffff)',
      padding: '6px 14px',
      borderRadius: '24px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
      border: '1px solid var(--color-border, #e2e8f0)',
      fontSize: '12px',
      fontWeight: '700',
      color: 'var(--color-text-primary, #0f172a)',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      backdropFilter: 'blur(8px)',
      userSelect: 'none'
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--color-primary, #34b27b)' }}>explore</span>
      <span>{zoomPercent}% ZOOM</span>
      <span style={{ color: 'var(--color-border, #cbd5e1)', margin: '0 2px' }}>|</span>
      <span style={{ fontSize: '11px', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>Lvl {Math.round(zoom)}</span>
    </div>
  );
}

/* ─── Zone Map Tab ─────────────────────────────────────────── */
function ZoneMapTab({ disasterId, onOpenModal }) {
  const { data: zones = [], isLoading } = useReliefZones(disasterId);
  const { data: sosAlerts = [] } = useSosList();
  const { data: users = [] } = useUsersList();
  const createZone = useCreateZone(disasterId);
  const deleteZone = useDeleteZone(disasterId);
  const [deleteError, setDeleteError] = useState(null);
  const { socket } = useRealtime();
  const [aiProgress, setAiProgress] = useState(null);
  const [orgSequenceProgress, setOrgSequenceProgress] = useState(null);

  useEffect(() => {
    if (!socket) return;
    const handleProgress = (data) => {
      setAiProgress(prev => {
        const curr = prev?.zoneId === data.zoneId ? { ...prev } : { zoneId: data.zoneId, items: [], orgs: [] };
        curr.stage = data.stage;
        if (data.items) curr.items = data.items;
        if (data.orgs) curr.orgs = data.orgs;
        if (data.message) curr.message = data.message;
        return curr;
      });
    };
    
    const handleOrgProgress = (data) => {
      setOrgSequenceProgress(prev => {
        const curr = prev?.requestId === data.requestId ? { ...prev } : { requestId: data.requestId, logs: [] };
        curr.currentOrg = data.org_name;
        curr.stage = data.stage;
        curr.message = data.message;
        
        if (data.stage === 'ALLOCATED' || data.stage === 'SKIPPED') {
            curr.logs = [...(curr.logs || []), {
                org: data.org_name,
                stage: data.stage,
                message: data.message,
                contributions: data.contributions
            }];
        }
        
        // Store fulfillment summary when sequence ends
        if (data.stage === 'COMPLETED' || data.stage === 'EXHAUSTED') {
            curr.fulfilled = data.fulfilled;
            curr.summary = data.summary;
        }
        
        return curr;
      });
    };
    
    socket.on('ai_agent_progress', handleProgress);
    socket.on('org_agent_progress', handleOrgProgress);
    return () => {
        socket.off('ai_agent_progress', handleProgress);
        socket.off('org_agent_progress', handleOrgProgress);
    };
  }, [socket]);

  const [drawing, setDrawing] = useState(false);
  const [severity, setSeverity] = useState('red');
  const [clickCenter, setClickCenter] = useState(null);
  const [radius, setRadius] = useState(500);
  const [zoneName, setZoneName] = useState('');
  const [autoAiEnabled, setAutoAiEnabled] = useState(true);
  const [askAmbulance, setAskAmbulance] = useState(false);
  const [ambulanceRoute, setAmbulanceRoute] = useState(null);
  const [osrmLine, setOsrmLine] = useState([]);
  const { data: inventoryLocations = [] } = useInventoryLocations();
  const ambulanceMut = useAmbulanceRoute();
  const { data: disasterRequests = [] } = useDisasterRequests(disasterId);

  const sosIcon = L.divIcon({
    className: 'sos-radar-blip-container',
    html: '<div class="sos-radar-blip"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

  const volunteerIcon = new L.divIcon({
    className: 'volunteer-marker-icon',
    html: `<div style="background-color: #007bff; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const inventoryIcon = L.divIcon({
    className: 'inventory-pin',
    html: `<div style="width:12px;height:12px;border-radius:50%;background:#34b27b;border:2px solid #e2e8f0;box-shadow:0 0 6px rgba(52,178,123,0.7);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  const waypointIcon = (n) => L.divIcon({
    className: 'ambulance-wp',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;color:#111;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.35);">${n}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  const buildAmbulanceRoute = useCallback((zone) => {
    if (!zone || zone.center_lat == null || zone.center_lng == null) return;
    const latest = Array.isArray(disasterRequests) && disasterRequests.length
      ? disasterRequests[0]
      : null;
    const needed = (latest?.items || DEFAULT_ITEMS).map((it) => it.resource_type || it.type).filter(Boolean);
    ambulanceMut.mutate(
      { lat: zone.center_lat, lng: zone.center_lng, needed },
      {
        onSuccess: async (plan) => {
          setAmbulanceRoute(plan);
          const pts = [
            plan.start,
            ...(plan.waypoints || []),
            plan.destination,
          ].filter((p) => p && p.lat != null && p.lng != null);
          if (pts.length < 2) {
            setOsrmLine(pts.map((p) => [p.lat, p.lng]));
            return;
          }
          const coordStr = pts.map((p) => `${p.lng},${p.lat}`).join(';');
          try {
            const res = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`,
            );
            const json = await res.json();
            const coords = json?.routes?.[0]?.geometry?.coordinates || [];
            setOsrmLine(coords.map(([lng, lat]) => [lat, lng]));
          } catch {
            setOsrmLine(pts.map((p) => [p.lat, p.lng]));
          }
        },
      },
    );
  }, [ambulanceMut, disasterRequests]);

  useEffect(() => {
    if (!askAmbulance) {
      setAmbulanceRoute(null);
      setOsrmLine([]);
      return;
    }
    const zone = zones?.[0];
    if (zone) buildAmbulanceRoute(zone);
  }, [askAmbulance, zones, buildAmbulanceRoute]);

  const handleMapClick = useCallback((latlng) => {
    setClickCenter(latlng);
    setZoneName(`Zone ${(zones?.length || 0) + 1}`);
  }, [zones]);

  const handleCreateZone = () => {
    if (!clickCenter || !zoneName) return;
    createZone.mutate({
      name: zoneName,
      severity,
      center_lng: clickCenter.lng,
      center_lat: clickCenter.lat,
      radius_meters: radius,
      auto_ai: autoAiEnabled,
    }, {
      onSuccess: () => { 
        setClickCenter(null); 
        setZoneName(''); 
        setDrawing(false); 
      },
      onError: (err) => {
        if (err.status === 409) {
          alert('Request already active, help is on the way');
        } else {
          alert(err.message || 'Failed to create zone');
        }
      }
    });
  };

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative' }}>

      {/* Map */}
      <div style={{ height: '100%', width: '100%' }}>
        <MapContainer
          center={[19.076, 72.877]}
          zoom={11}
          minZoom={3.5}
          maxZoom={18}
          maxBounds={[[-85, -180], [85, 180]]}
          maxBoundsViscosity={1.0}
          worldCopyJump={false}
          style={{ height: '100%', width: '100%', zIndex: 1, position: 'absolute' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <MapClickHandler onMapClick={handleMapClick} drawing={drawing} />
          <ZoomDisplay />

          {/* Existing zones */}
          {zones.map(z => {
            if (z.center_lat == null || z.center_lng == null) return null;
            return (
              <Circle key={z.id} center={[z.center_lat, z.center_lng]}
                radius={z.radius_meters}
                pathOptions={{
                  color: SEVERITY_COLORS[z.severity] || '#888',
                  fillColor: SEVERITY_COLORS[z.severity] || '#888',
                  fillOpacity: 0.15, dashArray: '8 4', weight: 2,
                }}
              />
            );
          })}

          {/* SOS Radars */}
          {sosAlerts
            .filter(s => s.lat != null && s.lng != null && s.status !== 'resolved')
            .map(s => (
              <Marker key={s.id} position={[s.lat, s.lng]} icon={sosIcon}>
                <Popup>
                  <strong style={{ color: 'var(--color-danger)' }}>SOS Alert</strong><br />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Status: {s.status}</span><br />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Volunteer: {s.volunteer_name || 'Anonymous'}</span><br />
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{new Date(s.created_at).toLocaleString()}</span>
                </Popup>
              </Marker>
            ))
          }

          {/* Volunteer Trackers */}
          {users
            .filter(u => u.lat != null && u.lng != null && u.role === 'volunteer' && u.is_active !== false)
            .map(u => (
              <Marker key={u.id} position={[u.lat, u.lng]} icon={volunteerIcon}>
                <Popup>
                  <strong style={{ color: '#007bff' }}>{u.full_name}</strong><br />
                  <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {u.is_assigned ? 'Status: Busy/Assigned' : 'Status: Free/Available'}
                  </span><br />
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{u.phone || 'No phone'}</span>
                </Popup>
              </Marker>
            ))
          }

          {/* Country-wide inventory resource pins */}
          {(Array.isArray(inventoryLocations) ? inventoryLocations : []).map((loc) => (
            loc.lat == null || loc.lng == null ? null : (
              <Marker key={loc.id} position={[loc.lat, loc.lng]} icon={inventoryIcon}>
                <Popup>
                  <strong style={{ color: '#166534' }}>{loc.name}</strong>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{loc.dept_name}</div>
                  {loc.address ? <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{loc.address}</div> : null}
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700 }}>Resources at this site</div>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, maxHeight: 160, overflowY: 'auto' }}>
                    {(loc.items || []).map((it, idx) => (
                      <li key={idx}>
                        <b>{it.item}</b> — {it.quantity}
                        {it.description ? <span style={{ color: 'var(--color-text-muted)' }}> ({it.description})</span> : null}
                      </li>
                    ))}
                  </ul>
                  {loc.contact_person ? (
                    <div style={{ fontSize: 11, marginTop: 8 }}>
                      {loc.contact_person} {loc.mobile ? `· ${loc.mobile}` : ''}
                    </div>
                  ) : null}
                </Popup>
              </Marker>
            )
          ))}

          {osrmLine.length > 1 && (
            <Polyline positions={osrmLine} pathOptions={{ color: '#f59e0b', weight: 5, opacity: 0.9 }} />
          )}
          {(ambulanceRoute?.waypoints || []).map((wp, idx) => (
            <Marker key={wp.id} position={[wp.lat, wp.lng]} icon={waypointIcon(idx + 1)}>
              <Popup>
                <strong>Stop {idx + 1}: {wp.name}</strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>Collect: {(wp.collects || []).join(', ')}</div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12 }}>
                  {(wp.items || []).map((it, i) => (
                    <li key={i}>{it.item} — {it.quantity}</li>
                  ))}
                </ul>
              </Popup>
            </Marker>
          ))}

          {/* Preview zone */}
          {clickCenter && (
            <Circle center={[clickCenter.lat, clickCenter.lng]} radius={radius}
              pathOptions={{
                color: SEVERITY_COLORS[severity], fillColor: SEVERITY_COLORS[severity],
                fillOpacity: 0.25, dashArray: '6 4', weight: 2,
              }}
            />
          )}
        </MapContainer>
      </div>

      {/* Floating Action Buttons Area (Bottom Right) */}
      <div style={{ position: 'absolute', bottom: 32, right: 32, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-end' }}>

        {/* Drawing tools flyout if drawing */}
        {drawing && !clickCenter && (
          <div style={{ background: 'var(--color-bg)', padding: 16, borderRadius: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 8, minWidth: 280 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 8 }}>Zone Severity</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {Object.entries(SEVERITY_COLORS).map(([key, color]) => (
                  <button key={key} onClick={() => setSeverity(key)} style={{
                    padding: '8px 0', borderRadius: 8, border: severity === key ? `2px solid ${color}` : '1px solid var(--color-border)',
                    background: severity === key ? color + '15' : 'var(--color-surface)',
                    color: color, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}>
                    {SEVERITY_LABELS[key].split(' ')[0]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Zone Radius</span>
                <span style={{ color: 'var(--color-primary)' }}>{radius}m</span>
              </label>
              <input type="range" min={100} max={5000} step={100} value={radius} onChange={e => setRadius(+e.target.value)}
                style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
            </div>
            
            {/* AI Auto-Orchestration Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: autoAiEnabled ? 'var(--color-primary-10)' : 'var(--color-surface)', border: `1px solid ${autoAiEnabled ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setAutoAiEnabled(!autoAiEnabled)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: autoAiEnabled ? 'var(--color-primary)' : 'var(--color-text-muted)', fontSize: 20 }}>
                  smart_toy
                </span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: autoAiEnabled ? 'var(--color-primary)' : 'var(--color-text-primary)' }}>AI Auto-Orchestrator</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{autoAiEnabled ? 'Automated dispatch enabled' : 'Manual dispatch only'}</span>
                </div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: autoAiEnabled ? 'var(--color-primary)' : '#cbd5e1', position: 'relative', transition: 'all 0.2s' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: autoAiEnabled ? 18 : 2, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: askAmbulance ? 'rgba(245,158,11,0.12)' : 'var(--color-surface)', border: `1px solid ${askAmbulance ? '#f59e0b' : 'var(--color-border)'}`, borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => setAskAmbulance(!askAmbulance)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="material-symbols-outlined" style={{ color: askAmbulance ? '#d97706' : 'var(--color-text-muted)', fontSize: 20 }}>
                  ambulance
                </span>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: askAmbulance ? '#d97706' : 'var(--color-text-primary)' }}>Ask Ambulance</span>
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{askAmbulance ? 'Collect requested supplies then go to the zone' : 'Off — no collection route'}</span>
                </div>
              </div>
              <div style={{ width: 36, height: 20, borderRadius: 10, background: askAmbulance ? '#f59e0b' : '#cbd5e1', position: 'relative', transition: 'all 0.2s' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute', top: 2, left: askAmbulance ? 18 : 2, transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
              </div>
            </div>

            <div style={{ padding: '8px 12px', background: 'var(--color-info-10)', borderRadius: 8, color: 'var(--color-info)', fontSize: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>touch_app</span>
              Click anywhere on the map to place the zone.
            </div>
          </div>
        )}

        <button
          onClick={() => setAskAmbulance((v) => !v)}
          title="Ask Ambulance"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999,
            background: askAmbulance ? '#f59e0b' : 'var(--color-surface)',
            color: askAmbulance ? '#111' : 'var(--color-text-primary)',
            border: `1px solid ${askAmbulance ? '#d97706' : 'var(--color-border)'}`,
            boxShadow: '0 6px 16px rgba(0,0,0,0.12)', cursor: 'pointer', fontWeight: 700, fontSize: 12,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>ambulance</span>
          Ask Ambulance
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={() => { setDrawing(!drawing); setClickCenter(null); }}
            title={drawing ? "Cancel Drawing" : "Draw Zone"}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%',
              background: drawing ? '#64748b' : 'var(--color-primary)', color: 'white', border: 'none',
              boxShadow: '0 6px 16px rgba(0,0,0,0.2)', cursor: 'pointer', transition: 'all 0.2s'
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{drawing ? 'close' : 'draw'}</span>
          </button>

          <button onClick={() => onOpenModal('request')}
            title="Manual Override Request"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%',
              background: 'var(--color-surface)', color: 'var(--color-primary)', border: '1px solid var(--color-border)',
              boxShadow: '0 6px 16px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'all 0.2s'
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>send</span>
          </button>

          <button onClick={() => onOpenModal('progress')}
            title="View Progress"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%',
              background: 'var(--color-surface)', color: 'var(--color-info)', border: '1px solid var(--color-border)',
              boxShadow: '0 6px 16px rgba(0,0,0,0.1)', cursor: 'pointer', transition: 'all 0.2s'
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>monitoring</span>
          </button>
        </div>
      </div>

      {/* Confirmation Overlay for Drawing & Delete List */}
      <div style={{ position: 'absolute', bottom: 32, left: 32, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Existing Zones List for deletion context */}
        {!drawing && zones.length > 0 && (
          <div style={{ background: 'var(--color-surface)', padding: '12px 16px', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid var(--color-border)', maxWidth: 320, maxHeight: 250, overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Zones</h4>
            
            {/* Delete Error Message */}
            {deleteError && (
              <div style={{ 
                marginBottom: 12, 
                padding: '10px 12px', 
                background: 'var(--badge-red-bg)', 
                borderRadius: 8,
                border: '1px solid var(--color-danger)',
                color: 'var(--badge-red-fg)',
                fontSize: 12
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}>error</span>
                {deleteError}
              </div>
            )}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {zones.map(z => {
                // Calculate total active assignments for this zone
                const totalActive = (z.active_tasks || 0) + (z.active_volunteers || 0) + 
                                   (z.active_coordinators || 0) + (z.deployed_resources || 0);
                const canDelete = totalActive === 0;
                
                return (
                  <div key={z.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: SEVERITY_COLORS[z.severity] }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span
                          style={{ fontWeight: 500, color: 'var(--color-text-primary)', cursor: askAmbulance ? 'pointer' : 'default' }}
                          onClick={() => askAmbulance && buildAmbulanceRoute(z)}
                        >{z.name}</span>
                        {totalActive > 0 && (
                          <span style={{ fontSize: 10, color: 'var(--color-warning)' }}>
                            {totalActive} active assignment(s)
                          </span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setDeleteError(null);
                        deleteZone.mutate(z.id, {
                          onError: (error) => {
                            setDeleteError(error.message);
                          }
                        });
                      }} 
                      disabled={!canDelete || deleteZone.isPending}
                      style={{ 
                        background: 'none', 
                        border: 'none', 
                        cursor: canDelete ? 'pointer' : 'not-allowed', 
                        color: canDelete ? 'var(--color-danger)' : 'var(--color-text-muted)', 
                        display: 'flex',
                        opacity: canDelete ? 1 : 0.5
                      }} 
                      title={canDelete ? 'Delete zone' : `Cannot delete: ${totalActive} active assignment(s)`}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Create Zone Dialog */}
        {clickCenter && drawing && (
          <div style={{
            background: 'var(--color-bg)', padding: 20, borderRadius: 16, boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            border: '1px solid var(--color-border)', width: 320, animation: 'slideUp 0.3s ease'
          }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, color: 'var(--color-text-primary)' }}>Confirm Zone Details</h3>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 4, display: 'block' }}>Zone Name</label>
              <input type="text" value={zoneName} onChange={e => setZoneName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', outline: 'none' }}
                placeholder="E.g. Flood Zone A" />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: 12, background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: SEVERITY_COLORS[severity] }} />
                <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text-primary)' }}>{SEVERITY_LABELS[severity]}</span>
              </div>
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{radius}m radius</span>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setClickCenter(null)} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
              <button onClick={handleCreateZone} disabled={createZone.isPending} style={{ flex: 1, padding: '10px 16px', borderRadius: 8, border: 'none', background: 'var(--color-primary)', color: 'white', cursor: 'pointer', fontWeight: 600 }}>
                {createZone.isPending ? 'Creating...' : 'Create Zone'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* AI Progress Tracker Modal (Initial Dispatch) */}
      {aiProgress && (
        <div style={{
          position: 'absolute', top: 24, right: 24, zIndex: 1000,
          background: 'var(--color-surface)', width: 320, borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)',
          overflow: 'hidden', animation: 'slideInRight 0.3s ease'
        }}>
          <div style={{ background: 'var(--color-primary-10)', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: 20 }}>smart_toy</span>
              <h4 style={{ margin: 0, fontSize: 14, color: 'var(--color-primary)' }}>AI Agent Tracking</h4>
            </div>
            <button onClick={() => setAiProgress(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
          <div style={{ padding: 16 }}>
            {/* Step 1: Requirements */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: ['REQUIREMENTS_DONE', 'NGO_SELECTION_DONE', 'COMPLETED'].includes(aiProgress.stage) ? 'var(--color-primary)' : aiProgress.stage === 'ERROR' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                  {['REQUIREMENTS_DONE', 'NGO_SELECTION_DONE', 'COMPLETED'].includes(aiProgress.stage) ? 'check_circle' : aiProgress.stage === 'ERROR' ? 'error' : 'radio_button_unchecked'}
                </span>
                <div style={{ width: 2, height: 24, background: 'var(--color-border)', margin: '4px 0' }} />
              </div>
              <div style={{ flex: 1 }} className="group">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Assessing Requirements</span>
                {aiProgress.stage === 'STARTING' && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-muted)' }}>{aiProgress.message}</p>}
                {aiProgress.stage === 'ERROR' && aiProgress.step === 'REQUIREMENTS' && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>{aiProgress.message}</p>}
                {aiProgress.items?.length > 0 && (
                  <div style={{ marginTop: 4, padding: 8, background: 'var(--color-bg)', borderRadius: 6, fontSize: 11, color: 'var(--color-text-secondary)', display: 'none', position: 'absolute', zIndex: 10, width: '100%', left: 0, top: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} className="group-hover-show">
                    <strong>Generated Resources:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                      {aiProgress.items.map((it, i) => <li key={i}>{it.quantity_needed}x {it.resource_type}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: NGOs */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: ['NGO_SELECTION_DONE', 'COMPLETED'].includes(aiProgress.stage) ? 'var(--color-primary)' : aiProgress.stage === 'ERROR' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                  {['NGO_SELECTION_DONE', 'COMPLETED'].includes(aiProgress.stage) ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <div style={{ width: 2, height: 24, background: 'var(--color-border)', margin: '4px 0' }} />
              </div>
              <div style={{ flex: 1 }} className="group">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Selecting Organizations</span>
                {aiProgress.stage === 'ERROR' && aiProgress.step === 'NGOS' && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>{aiProgress.message}</p>}
                {aiProgress.orgs?.length > 0 && (
                  <div style={{ marginTop: 4, padding: 8, background: 'var(--color-bg)', borderRadius: 6, fontSize: 11, color: 'var(--color-text-secondary)', display: 'none', position: 'absolute', zIndex: 10, width: '100%', left: 0, top: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} className="group-hover-show">
                    <strong>Selected NGOs ({aiProgress.orgs.length}):</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                      {aiProgress.orgs.slice(0, 5).map((o, i) => <li key={i}>{o.name}</li>)}
                      {aiProgress.orgs.length > 5 && <li>...and {aiProgress.orgs.length - 5} more</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Dispatch */}
            <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: aiProgress.stage === 'COMPLETED' ? 'var(--color-primary)' : aiProgress.stage === 'ERROR' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                  {aiProgress.stage === 'COMPLETED' ? 'check_circle' : 'radio_button_unchecked'}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Dispatching Requests</span>
                {aiProgress.stage === 'COMPLETED' && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-primary)' }}>{aiProgress.message}</p>}
                {aiProgress.stage === 'ERROR' && aiProgress.step === 'DISPATCH' && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-danger)' }}>{aiProgress.message}</p>}
              </div>
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
              .group:hover .group-hover-show { display: block !important; }
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
            `}} />
          </div>
        </div>
      )}

      {/* Multi-Agent Sequence Tracker (Admin side) */}
      {orgSequenceProgress && (
        <div style={{
          position: 'absolute', top: aiProgress ? 340 : 24, right: 24, zIndex: 1000,
          background: 'var(--color-surface)', width: 360, borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid var(--color-border)',
          overflow: 'hidden', animation: 'slideInRight 0.3s ease'
        }}>
          <div style={{
            background: orgSequenceProgress.stage === 'COMPLETED' ? '#f0fdf4' : orgSequenceProgress.stage === 'EXHAUSTED' ? '#fffbeb' : '#f8fafc',
            padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--color-border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{
                color: orgSequenceProgress.stage === 'COMPLETED' ? '#10b981' : orgSequenceProgress.stage === 'EXHAUSTED' ? '#f59e0b' : '#6366f1',
                fontSize: 20
              }}>
                {orgSequenceProgress.stage === 'COMPLETED' ? 'verified' : orgSequenceProgress.stage === 'EXHAUSTED' ? 'warning' : 'precision_manufacturing'}
              </span>
              <h4 style={{ margin: 0, fontSize: 14, color: orgSequenceProgress.stage === 'COMPLETED' ? '#15803d' : orgSequenceProgress.stage === 'EXHAUSTED' ? '#92400e' : '#4338ca' }}>
                {orgSequenceProgress.stage === 'COMPLETED' ? 'Allocation Complete' : orgSequenceProgress.stage === 'EXHAUSTED' ? 'Partially Fulfilled' : 'Multi-Agent Allocation'}
              </h4>
            </div>
            <button onClick={() => setOrgSequenceProgress(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>
          
          <div style={{ padding: 16, maxHeight: 400, overflowY: 'auto' }}>
            {/* Current Activity / Final Status */}
            <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {orgSequenceProgress.stage === 'COMPLETED' ? (
                  <span className="material-symbols-outlined" style={{ color: '#10b981', fontSize: 18 }}>check_circle</span>
                ) : orgSequenceProgress.stage === 'EXHAUSTED' ? (
                  <span className="material-symbols-outlined" style={{ color: '#f59e0b', fontSize: 18 }}>info</span>
                ) : (
                  <div style={{ width: 12, height: 12, border: '2px solid #6366f1', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                  {orgSequenceProgress.stage === 'COMPLETED'
                    ? 'All resources fulfilled!'
                    : orgSequenceProgress.stage === 'EXHAUSTED'
                    ? 'All organizations processed'
                    : `Agent working on ${orgSequenceProgress.currentOrg || '...'}`}
                </span>
              </div>
              {orgSequenceProgress.message && (
                <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
                  {orgSequenceProgress.message}
                </div>
              )}
            </div>

            {/* Fulfillment Summary (shown on COMPLETED/EXHAUSTED) */}
            {orgSequenceProgress.summary && orgSequenceProgress.summary.length > 0 && (
              <div style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: orgSequenceProgress.fulfilled ? '#f0fdf4' : '#fffbeb', border: `1px solid ${orgSequenceProgress.fulfilled ? '#bbf7d0' : '#fde68a'}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Fulfillment Summary</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {orgSequenceProgress.summary.map((item, i) => {
                    const pct = Math.min(100, Math.round((item.fulfilled / item.needed) * 100));
                    return (
                      <div key={i}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, color: '#334155' }}>{item.resource_type}</span>
                          <span style={{ color: pct >= 100 ? '#15803d' : '#92400e', fontWeight: 700 }}>{item.fulfilled}/{item.needed}</span>
                        </div>
                        <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#f59e0b', borderRadius: 2, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Allocation History */}
            {orgSequenceProgress.logs && orgSequenceProgress.logs.length > 0 && (
              <div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Allocation History</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                  {orgSequenceProgress.logs.map((log, i) => (
                    <div key={i} style={{ 
                      padding: 10, borderRadius: 8, 
                      background: log.stage === 'SKIPPED' ? '#f1f5f9' : '#f0fdf4',
                      border: `1px solid ${log.stage === 'SKIPPED' ? '#e2e8f0' : '#bbf7d0'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>{log.org || 'Unknown Org'}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: log.stage === 'SKIPPED' ? '#64748b' : '#15803d' }}>
                          {log.stage}
                        </span>
                      </div>
                      {log.contributions && log.contributions.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                          {log.contributions.map((c, j) => (
                            <span key={j} style={{ fontSize: 10, background: '#dcfce7', color: '#166534', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                              {c.quantity}x {c.resource_type}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes spin { 100% { transform: rotate(360deg); } }
            `}} />
          </div>
        </div>
      )}

    </div>
  );
}

/* ─── Request Form Tab ──────────────────────────────────────── */
function RequestFormTab({ disasterId }) {
  const { data: orgs = [] } = useAllOrganizations();
  const createRequest = useCreateRequest(disasterId);

  const [items, setItems] = useState(DEFAULT_ITEMS.map(i => ({ ...i })));
  const [customType, setCustomType] = useState('');
  const [customQty, setCustomQty] = useState(50);
  const [selectedOrgs, setSelectedOrgs] = useState([]);
  const [notes, setNotes] = useState('');

  const updateItemQty = (idx, val) => {
    const next = [...items];
    next[idx].quantity_needed = val;
    setItems(next);
  };

  const addCustomItem = () => {
    if (!customType.trim()) return;
    setItems([...items, { resource_type: customType.trim(), quantity_needed: customQty, is_default: false }]);
    setCustomType('');
    setCustomQty(50);
  };

  const removeItem = (idx) => {
    if (items[idx].is_default) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const toggleOrg = (orgId) => {
    setSelectedOrgs(prev => prev.includes(orgId) ? prev.filter(id => id !== orgId) : [...prev, orgId]);
  };

  const handleSubmit = () => {
    if (selectedOrgs.length === 0) return alert('Select at least one organization');
    createRequest.mutate({
      notes,
      items: items.filter(i => i.quantity_needed > 0),
      org_ids: selectedOrgs,
    }, {
      onSuccess: () => alert('Request sent to organizations!'),
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      {/* Left: Requirements */}
      <div>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)' }}>Resource Requirements</h4>
        {items.map((item, idx) => (
          <div key={idx} style={{
            padding: '12px 16px', marginBottom: 8, borderRadius: 10,
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>
                {item.is_default && <span style={{ color: 'var(--color-primary)', marginRight: 4 }}>●</span>}
                {item.resource_type}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-primary)', minWidth: 40, textAlign: 'right' }}>
                  {item.quantity_needed}
                </span>
                {!item.is_default && (
                  <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
                  </button>
                )}
              </div>
            </div>
            <input type="range" min={10} max={2000} step={10} value={item.quantity_needed}
              onChange={e => updateItemQty(idx, +e.target.value)}
              style={{ width: '100%', accentColor: 'var(--color-primary)' }} />
          </div>
        ))}

        {/* Add custom */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input value={customType} onChange={e => setCustomType(e.target.value)} placeholder="Custom resource (e.g. Blankets)"
            style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', fontSize: 13 }} />
          <input type="number" value={customQty} onChange={e => setCustomQty(+e.target.value)} min={1}
            style={{ width: 70, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text-primary)', fontSize: 13 }} />
          <button className={styles.submitBtn} onClick={addCustomItem} style={{ padding: '8px 14px', fontSize: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Add
          </button>
        </div>

        {/* Notes */}
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional notes for organizations..."
          rows={3} style={{
            width: '100%', marginTop: 12, padding: '10px 14px', borderRadius: 10,
            border: '1px solid var(--color-border)', background: 'var(--color-bg)',
            color: 'var(--color-text-primary)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
          }} />
      </div>

      {/* Right: Org selection */}
      <div>
        <h4 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Select Organizations ({selectedOrgs.length} selected)
        </h4>
        {orgs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>No organizations registered yet.</p>
        ) : (
          <div style={{ maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {orgs.map(org => {
              const isSelected = selectedOrgs.includes(org.id);
              return (
                <div key={org.id} onClick={() => toggleOrg(org.id)} style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  background: isSelected ? 'var(--color-primary-10)' : 'var(--color-surface)',
                  border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: isSelected ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                      {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text-primary)' }}>{org.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                        {[org.district, org.state].filter(Boolean).join(', ') || org.email || '—'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button className={styles.submitBtn} onClick={handleSubmit}
          disabled={createRequest.isPending || selectedOrgs.length === 0}
          style={{ marginTop: 16, width: '100%', padding: '12px 0', fontSize: 14 }}>
          {createRequest.isPending ? 'Sending...' : `Send Request to ${selectedOrgs.length} Organization(s)`}
        </button>
      </div>
    </div>
  );
}

/* ─── Progress Tab ──────────────────────────────────────────── */
function ProgressTab({ disasterId }) {
  const { data: requests = [], isLoading } = useDisasterRequests(disasterId);

  if (isLoading) return <div style={{ color: 'var(--color-text-muted)' }}>Loading...</div>;
  if (requests.length === 0) return <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>No requests sent yet.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {requests.map(req => (
        <div key={req.id} style={{ padding: 20, borderRadius: 12, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Request by {req.created_by_name}</span>
              {req.notes && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>{req.notes}</p>}
            </div>
            <span className={`${styles.badge} ${req.status === 'fulfilled' ? styles.badge_info : styles.badge_muted}`}>
              {req.status}
            </span>
          </div>

          {/* Progress Bars */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {req.items?.map(item => {
              const pct = Math.min(100, Math.round((item.quantity_fulfilled / item.quantity_needed) * 100));
              return (
                <div key={item.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.resource_type}</span>
                    <span style={{ color: pct >= 100 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                      {item.quantity_fulfilled} / {item.quantity_needed} ({pct}%)
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--color-border)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: `${pct}%`,
                      background: pct >= 100 ? 'var(--color-primary)' : pct > 50 ? '#f59e0b' : '#ef4444',
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Org assignments */}
          <div style={{ marginTop: 14 }}>
            <h5 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Organizations</h5>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {req.assignments?.map(a => (
                <span key={a.id} style={{
                  padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: a.status === 'accepted' ? 'var(--badge-green-bg)' : a.status === 'rejected' ? 'var(--badge-red-bg)' : a.status === 'cancelled' ? 'var(--badge-muted-bg)' : 'var(--badge-amber-bg)',
                  color: a.status === 'accepted' ? 'var(--badge-green-fg)' : a.status === 'rejected' ? 'var(--badge-red-fg)' : a.status === 'cancelled' ? 'var(--badge-muted-fg)' : 'var(--badge-amber-fg)',
                }}>
                  {a.org_name}: {a.status}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────────── */
export function ReliefCoordination() {
  const { data: disasters = [], isLoading: loadingDisasters } = useDisastersList();
  const [selectedDisaster, setSelectedDisaster] = useState('');
  const [activeModal, setActiveModal] = useState(null);

  const activeDisasters = disasters.filter(d => d.status === 'active' || d.status === 'monitoring');

  useEffect(() => {
    if (activeDisasters.length > 0 && !selectedDisaster) {
      setSelectedDisaster(activeDisasters[0].id);
    }
  }, [activeDisasters, selectedDisaster]);

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 'calc(100vh - 105px)', width: '100%', display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', overflow: 'hidden' }}>

      {/* Top Floating Bar for Disaster Selection */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 1000,
        background: 'var(--color-surface)', padding: '6px 16px', borderRadius: 30,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)', border: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 8
      }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: 18 }}>public</span>
          Disaster:
        </label>
        <select value={selectedDisaster} onChange={e => setSelectedDisaster(e.target.value)}
          style={{ padding: '4px 4px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--color-text-primary)', outline: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
          {loadingDisasters ? <option>Loading...</option> : activeDisasters.length === 0 ? <option>No active disasters</option> :
            activeDisasters.map(d => <option key={d.id} value={d.id}>{d.name}</option>)
          }
        </select>
      </div>

      {/* Fullscreen Map */}
      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        {selectedDisaster ? (
          <ZoneMapTab disasterId={selectedDisaster} onOpenModal={setActiveModal} />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)' }}>
            <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.5 }}>warning</span>
              <p>Select or create an active disaster first</p>
            </div>
          </div>
        )}
      </div>

      {/* Modals Overlay */}
      {activeModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24
        }}>
          <div style={{
            background: 'var(--color-bg)', borderRadius: 16, width: '100%', maxWidth: 800, maxHeight: '90vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-surface)', borderRadius: '16px 16px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: 18, color: 'var(--color-text-primary)' }}>
                {activeModal === 'request' ? 'Send Resource Request' : 'Resource Fulfillment Progress'}
              </h2>
              <button onClick={() => setActiveModal(null)} style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
            <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
              {activeModal === 'request' && <RequestFormTab disasterId={selectedDisaster} onClose={() => setActiveModal(null)} />}
              {activeModal === 'progress' && <ProgressTab disasterId={selectedDisaster} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
