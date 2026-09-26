import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { io } from 'socket.io-client';

const vehicleIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1032/1032997.png',
  iconSize: [35, 35],
  iconAnchor: [17, 35],
  popupAnchor: [0, -35]
});

const colors = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#9333ea'];

export default function FleetTracker() {
  const [vehicles, setVehicles] = useState({});
  const [routes, setRoutes] = useState({});

  useEffect(() => {
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000');
    
    const fetchVehicles = async () => {
      try {
        const [vehRes, dispatchRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/fleet/vehicles`),
          fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/fleet/dispatch/active`)
        ]);
        const vData = await vehRes.json();
        const dData = await dispatchRes.json();
        
        const vMap = {};
        vData.forEach(v => {
          if (v.lat && v.lng) vMap[v.id] = v;
        });
        
        // Match active dispatches to vehicles (latest only)
        const processedVehicles = new Set();
        dData.forEach((d) => {
          if (d.vehicle_id && !processedVehicles.has(d.vehicle_id)) {
            processedVehicles.add(d.vehicle_id);
            // Update vehicle position if available in join
            if (d.vehicle_lat && d.vehicle_lng) {
              vMap[d.vehicle_id] = { ...vMap[d.vehicle_id], id: d.vehicle_id, lat: d.vehicle_lat, lng: d.vehicle_lng };
            }
            if (vMap[d.vehicle_id]) {
              fetchRoute(d.vehicle_id, vMap[d.vehicle_id].lat, vMap[d.vehicle_id].lng, d.dropoff_lat, d.dropoff_lng, colors[processedVehicles.size % colors.length]);
            }
          }
        });

        // Cleanup routes that are no longer active
        setRoutes(prev => {
          const newRoutes = { ...prev };
          Object.keys(newRoutes).forEach(vId => {
            if (!processedVehicles.has(vId)) {
              delete newRoutes[vId];
            }
          });
          return newRoutes;
        });
        
        setVehicles(vMap);
      } catch(err) {
        console.error('Failed to fetch fleet data', err);
      }
    };
    fetchVehicles();
    const interval = setInterval(fetchVehicles, 5000);

    socket.on('fleet.location.broadcast', (data) => {
      setVehicles(prev => ({
        ...prev,
        [data.vehicleId]: {
          ...prev[data.vehicleId],
          id: data.vehicleId,
          lat: data.lat,
          lng: data.lng,
          last_updated: new Date().toISOString()
        }
      }));
    });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const fetchRoute = async (vehicleId, startLat, startLng, endLat, endLng, color) => {
    if (!startLat || !endLat) return;
    try {
      const url = `http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?geometries=geojson`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        setRoutes(prev => ({
          ...prev,
          [vehicleId]: { path: coords, color }
        }));
      }
    } catch(err) {
      console.error(err);
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 64px)', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, left: 50, zIndex: 1000, background: 'white', padding: '10px 20px', borderRadius: 8, boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: 0, color: '#0f172a' }}>Live Fleet Tracking</h2>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Active Vehicles: {Object.keys(vehicles).length}</p>
      </div>

      <MapContainer center={[18.5204, 73.8567]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
        
        {Object.values(vehicles).map(v => (
          <Marker key={v.id} position={[Number(v.lat), Number(v.lng)]} icon={vehicleIcon}>
            <Popup>
              <strong>{v.name || 'Emergency Vehicle'}</strong><br />
              Status: {v.status || 'Active'}<br />
              ID: {v.id.substring(0, 8)}...<br/>
              Last seen: {new Date(v.last_updated).toLocaleTimeString()}
            </Popup>
          </Marker>
        ))}

        {Object.entries(routes).map(([vid, routeInfo]) => (
          <Polyline 
            key={vid} 
            positions={routeInfo.path} 
            color={routeInfo.color} 
            weight={5} 
            dashArray="10, 10" 
          />
        ))}
      </MapContainer>
    </div>
  );
}
