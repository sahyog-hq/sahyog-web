import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import io from 'socket.io-client';
import { useAuth } from '@clerk/clerk-react';
import { apiRequest, apiPaths } from '../lib/api';
import 'leaflet/dist/leaflet.css';
import ThreeDModal from '../components/ThreeDModal';

// Fix for default marker icons in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function isValidCoord(lat, lng) {
    if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return false;
    // Filter out (0,0) Null Island / Ocean coordinates
    if (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) return false;
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function extractAlertCoords(alert) {
    if (!alert) return null;
    let lat = asNumber(alert.lat);
    let lng = asNumber(alert.lng);

    if (lat === null || lng === null) {
        if (alert.location) {
            if (Array.isArray(alert.location.coordinates) && alert.location.coordinates.length >= 2) {
                // PostGIS / GeoJSON format is [longitude, latitude]
                lng = asNumber(alert.location.coordinates[0]);
                lat = asNumber(alert.location.coordinates[1]);
            } else if (alert.location.lat != null && alert.location.lng != null) {
                lat = asNumber(alert.location.lat);
                lng = asNumber(alert.location.lng);
            }
        }
    }

    if (isValidCoord(lat, lng)) {
        return { lat, lng };
    }
    return null;
}

function MapRecenter({ target }) {
    const map = useMap();
    const lastTargetRef = useRef(target ? `${Number(target.lat).toFixed(4)}_${Number(target.lng).toFixed(4)}_${target.zoom || 15}` : 'empty');
    const isInitialMount = useRef(true);

    useEffect(() => {
        // Ensure tiles and canvas layers align immediately without layout lag
        map.invalidateSize();
        isInitialMount.current = false;
    }, [map]);

    useEffect(() => {
        if (target && isValidCoord(target.lat, target.lng)) {
            const key = `${Number(target.lat).toFixed(4)}_${Number(target.lng).toFixed(4)}_${target.zoom || 15}`;
            if (lastTargetRef.current !== key) {
                lastTargetRef.current = key;
                if (isInitialMount.current) {
                    // Settle immediately on open without shifting or floating pins
                    map.setView([target.lat, target.lng], target.zoom || 15, { animate: false });
                } else {
                    map.flyTo([target.lat, target.lng], target.zoom || 15, {
                        animate: true,
                        duration: 1.5,
                    });
                }
            }
        }
    }, [target, map]);

    return null;
}

const shelterIcon = L.divIcon({
    className: 'heatmap-shelter-marker',
    html: '<div style="width:14px;height:14px;border-radius:999px;background:#2563eb;border:2px solid #fff;box-shadow:0 0 6px rgba(0,0,0,0.35)"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
});

function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeHeatPoint(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const lat = asNumber(raw.lat ?? raw.latitude ?? raw.location?.coordinates?.[1]);
    const lng = asNumber(raw.lng ?? raw.longitude ?? raw.location?.coordinates?.[0]);
    if (lat === null || lng === null) return null;

    return {
        lat,
        lng,
        count: Math.max(1, asNumber(raw.count) ?? 1),
        severity: Math.max(1, Math.min(10, asNumber(raw.severity) ?? 1)),
    };
}

function normalizeShelter(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const lat = asNumber(raw.lat ?? raw.latitude ?? raw.location?.coordinates?.[1]);
    const lng = asNumber(raw.lng ?? raw.longitude ?? raw.location?.coordinates?.[0]);
    if (lat === null || lng === null) return null;

    return {
        id: raw.id || `${lat}-${lng}`,
        name: raw.name || 'Shelter',
        lat,
        lng,
        capacity: raw.capacity,
        occupancy: raw.occupancy,
    };
}

function heatColor(severity) {
    if (severity >= 8) return '#ef4444';
    if (severity >= 5) return '#f97316';
    return '#22c55e';
}

// Dynamic Icon for SOS Alerts
function getSosIcon(isLive) {
    if (isLive) {
        return L.divIcon({
            className: 'sos-live-marker',
            html: `
            <div style="position: relative; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;">
              <div style="position: absolute; width: 100%; height: 100%; background-color: #ef4444; border-radius: 50%; opacity: 0.8; animation: livePulse 1s ease-out infinite;"></div>
              <div style="position: absolute; background-color: #ef4444; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 8px rgba(239, 68, 68, 0.8);"></div>
            </div>
            <style>
              @keyframes livePulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(4); opacity: 0; }
              }
            </style>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
        });
    }

    return L.divIcon({
        className: 'sos-radar-blip-marker',
        html: `
        <div class="sos-radar-blip-container">
          <div class="sos-radar-blip"></div>
        </div>
      `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });
}

// Dynamic Icon for Responders (with Live Pulse)
function getResponderIcon(role, isLive) {
    const color = role === 'coordinator' ? '#10b981' : '#3b82f6';
    if (isLive) {
        return L.divIcon({
            className: 'live-responder-marker',
            html: `
            <div style="position: relative; width: 14px; height: 14px;">
              <div style="position: absolute; width: 100%; height: 100%; background-color: ${color}; border-radius: 50%; opacity: 0.8; animation: livePulse 1.5s ease-out infinite;"></div>
              <div style="position: absolute; background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.3);"></div>
            </div>
            <style>
              @keyframes livePulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(3.5); opacity: 0; }
              }
            </style>
          `,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
    } else {
        return L.divIcon({
            className: 'static-responder-marker',
            html: `<div style="background-color: ${color}; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.3); opacity: 0.8;"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
    }
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

function LiveHeatLayer({ points }) {
    const map = useMap();

    useEffect(() => {
        if (!map || typeof L.heatLayer !== 'function') return undefined;

        const weighted = points.map((point) => {
            const severityWeight = point.severity / 10;
            const countBoost = Math.min(point.count, 10) / 20;
            const intensity = Math.min(1, severityWeight * 0.7 + countBoost);
            return [point.lat, point.lng, intensity];
        });

        if (!weighted.length) return undefined;

        const layer = L.heatLayer(weighted, {
            radius: 34,
            blur: 30,
            maxZoom: 17,
            minOpacity: 0.55,
            gradient: {
                0.2: 'rgba(255, 240, 100, 0.40)',
                0.4: 'rgba(255, 160, 50, 0.70)',
                0.6: 'rgba(255, 80, 30, 0.85)',
                0.8: 'rgba(220, 0, 30, 0.95)',
                1.0: 'rgba(180, 0, 40, 1.00)',
            },
        }).addTo(map);

        return () => {
            map.removeLayer(layer);
        };
    }, [map, points]);

    return null;
}

export function LiveMap() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const queryLat = asNumber(searchParams.get('lat'));
    const queryLng = asNumber(searchParams.get('lng'));

    const [alerts, setAlerts] = useState({}); // { id: alertData }
    const [volunteers, setVolunteers] = useState({}); // { id: userData }
    const [heatmapPoints, setHeatmapPoints] = useState([]);
    const [shelters, setShelters] = useState([]);
    const [heatmapUpdatedAt, setHeatmapUpdatedAt] = useState(null);
    const [targetLocation, setTargetLocation] = useState(() => {
        if (isValidCoord(queryLat, queryLng)) {
            return { lat: queryLat, lng: queryLng, zoom: 15 };
        }
        return null;
    });
    const [selectedAlertFor3D, setSelectedAlertFor3D] = useState(null);
    const { getToken, isLoaded, isSignedIn } = useAuth();

    useEffect(() => {
        if (isValidCoord(queryLat, queryLng)) {
            setTargetLocation({ lat: queryLat, lng: queryLng, zoom: 15 });
        }
    }, [queryLat, queryLng]);

    useEffect(() => {
        if (!isLoaded || !isSignedIn) return;

        // Initial fetch of active SOS alerts
        apiRequest(apiPaths.sos, {}, getToken)
            .then(data => {
                if (Array.isArray(data)) {
                    const activeAlerts = {};
                    data.forEach(alert => {
                        if (alert.status !== 'resolved' && alert.status !== 'cancelled') {
                            activeAlerts[alert.id] = alert;
                        }
                    });
                    setAlerts(activeAlerts);

                    // Default map to the latest active SOS coordinate (newest first, sorted by created_at)
                    if (!isValidCoord(queryLat, queryLng)) {
                        const sorted = Object.values(activeAlerts).sort((a, b) => {
                            const timeA = new Date(a.created_at || 0).getTime();
                            const timeB = new Date(b.created_at || 0).getTime();
                            return timeB - timeA;
                        });

                        for (const alert of sorted) {
                            const coords = extractAlertCoords(alert);
                            if (coords) {
                                console.log('Centering map on latest SOS alert:', alert.id, coords);
                                setTargetLocation({ lat: coords.lat, lng: coords.lng, zoom: 15 });
                                break;
                            }
                        }
                    }
                }
            })
            .catch(err => console.error('Failed to fetch initial SOS alerts:', err));

        // Initial fetch of responders (volunteers & coordinators)
        apiRequest(apiPaths.users, {}, getToken)
            .then(data => {
                if (Array.isArray(data)) {
                    const liveResponders = {};
                    data.forEach(user => {
                        if ((user.role === 'volunteer' || user.role === 'coordinator' || user.role === 'vehicle') && isValidCoord(asNumber(user.lat), asNumber(user.lng))) {
                            liveResponders[user.id] = user;
                        }
                    });
                    setVolunteers(liveResponders);
                }
            })
            .catch(err => console.error('Failed to fetch responders:', err));

        // Socket.io connection with fallback
        const socketUrl = import.meta.env.VITE_API_URL || window.location.origin;
        const socket = io(socketUrl, {
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });

        socket.on('new_sos_alert', (data) => {
            console.log('New SOS Alert received on Map:', data);
            setAlerts(prev => ({ ...prev, [data.id]: data }));

            // Smoothly focus map on incoming emergency without bouncing back
            const coords = extractAlertCoords(data);
            if (coords) {
                setTargetLocation({ lat: coords.lat, lng: coords.lng, zoom: 15 });
            }
        });

        socket.on('sos_resolved', (data) => {
            setAlerts(prev => {
                const next = { ...prev };
                delete next[data.id];
                return next;
            });
        });

        const handleLocationUpdate = (data) => {
            const id = data.id || data.userId;
            if (!id) return;

            // Check if it's a responder
            if (data.role === 'volunteer' || data.role === 'coordinator' || data.role === 'vehicle') {
                setVolunteers(prev => ({
                    ...prev,
                    [id]: { ...prev[id], ...data, id, last_active: new Date().toISOString() }
                }));
            }

            // Allow any role to update an active SOS alert location if they are the reporter
            setAlerts(prev => {
                let foundAlertId = null;
                for (const key in prev) {
                    if (prev[key].reporter_id === id || prev[key].reporterId === id || prev[key].userId === id) {
                        foundAlertId = key;
                        break;
                    }
                }
                if (foundAlertId) {
                    return {
                        ...prev,
                        [foundAlertId]: { ...prev[foundAlertId], lat: data.lat, lng: data.lng, last_active: new Date().toISOString() }
                    };
                }
                return prev;
            });
        };

        socket.on('volunteer_location_update', handleLocationUpdate);
        socket.on('location.update', handleLocationUpdate);
        socket.on('fleet.location.broadcast', (data) => {
            handleLocationUpdate({
                id: data.vehicleId || data.id,
                role: 'vehicle',
                lat: data.lat,
                lng: data.lng,
                full_name: data.name || 'Vehicle',
            });
        });
        socket.on('heatmap:update', (payload = {}) => {
            const points = Array.isArray(payload.points)
                ? payload.points.map(normalizeHeatPoint).filter(Boolean)
                : [];
            const sheltersData = Array.isArray(payload.shelters)
                ? payload.shelters.map(normalizeShelter).filter(Boolean)
                : [];

            setHeatmapPoints(points);
            setShelters(sheltersData);
            setHeatmapUpdatedAt(payload.updatedAt || new Date().toISOString());
        });

        return () => {
            socket.disconnect();
        };
    }, [isLoaded, isSignedIn, getToken]);

    const alertList = Object.values(alerts);
    const volList = Object.values(volunteers);

    return (
        <div style={{
            height: '100%',
            minHeight: 'calc(100vh - 105px)',
            width: '100%',
            position: 'relative',
            overflow: 'hidden'
        }}>
            <MapContainer
                center={targetLocation && isValidCoord(targetLocation.lat, targetLocation.lng) ? [targetLocation.lat, targetLocation.lng] : [18.5204, 73.8567]}
                zoom={targetLocation ? (targetLocation.zoom || 15) : 11}
                minZoom={3.5}
                maxZoom={18}
                maxBounds={[[-85, -180], [85, 180]]}
                maxBoundsViscosity={1.0}
                worldCopyJump={false}
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapRecenter target={targetLocation} />
                <ZoomDisplay />

                {/* Smooth Heatmap Layer */}
                <LiveHeatLayer points={heatmapPoints} />

                {/* Critical Hotspot Pins (Severity >= 8) */}
                {heatmapPoints
                    .filter((point) => point.severity >= 8)
                    .map((point, index) => {
                    const color = heatColor(point.severity);
                    return (
                        <CircleMarker
                            key={`hm-critical-${index}-${point.lat}-${point.lng}`}
                            center={[point.lat, point.lng]}
                            radius={7}
                            pathOptions={{
                                color: '#ffffff',
                                weight: 2,
                                fillColor: color,
                                fillOpacity: 0.95,
                            }}
                        >
                            <Popup>
                                <div style={{ minWidth: '160px' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Critical Heat Zone</h4>
                                    <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>Count:</strong> {point.count}</p>
                                    <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>Severity:</strong> {point.severity}</p>
                                    <p style={{ margin: '4px 0', fontSize: '12px' }}><strong>Band:</strong> Red (8-10)</p>
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}

                {/* Shelter Pins */}
                {shelters.map((shelter) => (
                    <Marker key={shelter.id} position={[shelter.lat, shelter.lng]} icon={shelterIcon}>
                        <Popup>
                            <div style={{ minWidth: '150px' }}>
                                <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', color: '#2563eb' }}>{shelter.name}</h4>
                                {shelter.occupancy != null && shelter.capacity != null && (
                                    <p style={{ margin: '4px 0', fontSize: '12px' }}>
                                        <strong>Occupancy:</strong> {shelter.occupancy}/{shelter.capacity}
                                    </p>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                ))}

                {/* SOS Alerts */}
                {alertList.map(alert => {
                    const coords = extractAlertCoords(alert);
                    if (!coords) return null;
                    const { lat, lng } = coords;

                    const lastActive = alert.last_active ? new Date(alert.last_active).getTime() : 0;
                    const isLive = (Date.now() - lastActive) < 60000;

                    return (
                        <Marker key={alert.id} position={[lat, lng]} icon={getSosIcon(isLive)}>
                            <Tooltip direction="top" offset={[0, -12]} permanent className="sos-permanent-label">
                                <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '11px', textShadow: '0 0 3px rgba(255,255,255,0.8)' }}>
                                    {alert.reporter_name || alert.type || 'SOS Alert'}
                                </span>
                            </Tooltip>
                            <Popup>
                                <div style={{ minWidth: '160px' }}>
                                    <h4 style={{ margin: '0 0 8px 0', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>emergency</span>
                                        SOS ALERT
                                    </h4>
                                    <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Type:</strong> {alert.type || 'Emergency'}</p>
                                    <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Reporter:</strong> {alert.reporter_name || 'Anonymous'}</p>
                                    <p style={{ margin: '4px 0', fontSize: '13px' }}><strong>Phone:</strong> {alert.reporter_phone || '—'}</p>
                                    <p style={{ margin: '4px 0', fontSize: '11px', color: '#64748b' }}>{new Date(alert.created_at).toLocaleString()}</p>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                        <button
                                            style={{
                                                flex: 1,
                                                padding: '7px 8px',
                                                background: '#ef4444',
                                                color: '#fff',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '4px'
                                            }}
                                            onClick={() => navigate('/sos')}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>list_alt</span>
                                            Manage
                                        </button>
                                        <button
                                            style={{
                                                flex: 1,
                                                padding: '7px 8px',
                                                background: '#0f172a',
                                                color: '#38bdf8',
                                                border: '1px solid rgba(56, 189, 248, 0.4)',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '4px'
                                            }}
                                            onClick={() => setSelectedAlertFor3D(alert)}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>view_in_ar</span>
                                            3D View
                                        </button>
                                    </div>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {/* Live Responders */}
                {volList.map(vol => {
                    const lastActive = vol.last_active ? new Date(vol.last_active).getTime() : 0;
                    const isLive = (Date.now() - lastActive) < 60000; // pulse if updated in the last 60 seconds
                    return (
                        <Marker key={vol.id} position={[vol.lat, vol.lng]} icon={getResponderIcon(vol.role, isLive)}>
                            <Popup>
                                <div style={{ minWidth: '120px' }}>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', color: vol.role === 'coordinator' ? '#10b981' : '#3b82f6' }}>{vol.full_name || vol.name || 'Responder'}</h4>
                                    <p style={{ margin: '2px 0', fontSize: '11px', color: '#64748b' }}>{vol.role.charAt(0).toUpperCase() + vol.role.slice(1)}</p>
                                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>Last Active: {new Date(vol.last_active || Date.now()).toLocaleTimeString()}</span>
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Flat Emergency Status HUD Chip */}
            <div style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                zIndex: 1000,
                background: 'var(--color-surface, #ffffff)',
                padding: '7px 16px',
                borderRadius: '24px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                border: '1px solid var(--color-border, #e2e8f0)',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--color-text-primary, #0f172a)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backdropFilter: 'blur(8px)',
                userSelect: 'none'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#ef4444' }}>radar</span>
                    <span style={{ fontWeight: '800', letterSpacing: '0.3px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-text-secondary, #64748b)' }}>Emergency</span>
                </div>
                <span style={{ color: 'var(--color-border, #cbd5e1)' }}>|</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: alertList.length > 0 ? '#ef4444' : '#10b981', fontWeight: '800' }}>{alertList.length}</span>
                    <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '11px' }}>SOS</span>
                </div>
                <span style={{ color: 'var(--color-border, #cbd5e1)' }}>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#3b82f6', fontWeight: '800' }}>{volList.length}</span>
                    <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '11px' }}>Responders</span>
                </div>
                <span style={{ color: 'var(--color-border, #cbd5e1)' }}>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#f59e0b', fontWeight: '800' }}>{heatmapPoints.length}</span>
                    <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '11px' }}>Zones</span>
                </div>
                <span style={{ color: 'var(--color-border, #cbd5e1)' }}>•</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#10b981', fontWeight: '800' }}>{shelters.length}</span>
                    <span style={{ color: 'var(--color-text-muted, #64748b)', fontSize: '11px' }}>Shelters</span>
                </div>
            </div>

            {/* 3D Virtual Command & Satellite Modal */}
            {selectedAlertFor3D && (
                <ThreeDModal
                    isOpen={Boolean(selectedAlertFor3D)}
                    onClose={() => setSelectedAlertFor3D(null)}
                    lat={selectedAlertFor3D.lat || (selectedAlertFor3D.location?.coordinates ? selectedAlertFor3D.location.coordinates[1] : null)}
                    lng={selectedAlertFor3D.lng || (selectedAlertFor3D.location?.coordinates ? selectedAlertFor3D.location.coordinates[0] : null)}
                    alertInfo={selectedAlertFor3D}
                    extraMarkers={volList}
                />
            )}
        </div>
    );
}
