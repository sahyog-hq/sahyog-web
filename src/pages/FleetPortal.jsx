import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-routing-machine';
import 'leaflet-routing-machine/dist/leaflet-routing-machine.css';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

// Fix Leaflet icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom ambulance icon
const vehicleIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1032/1032997.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20]
});

// Routing Component Hook
const RoutingMachine = ({ waypoints }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!map || waypoints.length < 2) return;
    
    // Clear existing routing controls if any
    if (map.routingControl) {
      map.removeControl(map.routingControl);
    }
    
    const routingControl = L.Routing.control({
      waypoints: waypoints.map(wp => L.latLng(wp[0], wp[1])),
      routeWhileDragging: false,
      addWaypoints: false,
      show: true,
      lineOptions: {
        styles: [{ color: '#3b82f6', weight: 6, opacity: 0.8 }]
      },
      createMarker: () => null // Hide default OSRM markers as we use our own
    }).addTo(map);
    
    map.routingControl = routingControl;
    
    return () => map.removeControl(routingControl);
  }, [map, waypoints]);
  
  return null;
};

export default function FleetPortal() {
  const [socket, setSocket] = useState(null);
  const [vehicleId, setVehicleId] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  
  const [currentLocation, setCurrentLocation] = useState([18.5204, 73.8567]); // Default Pune
  const [activeMission, setActiveMission] = useState(null); // The dispatch_request
  const [incomingPing, setIncomingPing] = useState(null); // New dispatch request
  
  useEffect(() => {
    // Setup Socket
    const newSocket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000');
    setSocket(newSocket);
    
    newSocket.on('fleet.dispatch.ping', (data) => {
      // Receive broadcasted dispatch request
      setIncomingPing(data);
    });
    
    return () => newSocket.close();
  }, []);

  // Track location
  useEffect(() => {
    if (!isOnline) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurrentLocation([latitude, longitude]);
        
        if (socket && vehicleId) {
          socket.emit('fleet.location.update', {
            vehicleId,
            lat: latitude,
            lng: longitude
          });
        }
      },
      (err) => console.error(err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
    );
    
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isOnline, socket, vehicleId]);

  const handleAcceptMission = async () => {
    if (!incomingPing || !vehicleId) return;
    
    // Call backend to update dispatch_request status
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/fleet/dispatch/${incomingPing.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'accepted', vehicle_id: vehicleId })
      });
      const data = await res.json();
      setActiveMission(data);
      setIncomingPing(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompleteMission = async () => {
    if (!activeMission) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/fleet/dispatch/${activeMission.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed', vehicle_id: vehicleId })
      });
      setActiveMission(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Determine waypoints safely casting strings to numbers
  const waypoints = activeMission ? (
    activeMission.pickup_lat 
      ? [
          currentLocation, 
          [Number(activeMission.pickup_lat), Number(activeMission.pickup_lng)], 
          [Number(activeMission.dropoff_lat), Number(activeMission.dropoff_lng)]
        ] // Admin->NGO->Zone
      : [
          currentLocation, 
          [Number(activeMission.dropoff_lat), Number(activeMission.dropoff_lng)]
        ] // TeamLead->Zone
  ) : [];

  if (!isOnline) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white' }}>
        <img src="https://cdn-icons-png.flaticon.com/512/1032/1032997.png" alt="Ambulance" style={{ width: 100, marginBottom: 20 }} />
        <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>ResQDrive Portal</h1>
        <input 
          type="text" 
          placeholder="Enter Vehicle UUID" 
          value={vehicleId} 
          onChange={(e) => setVehicleId(e.target.value)}
          style={{ padding: 12, borderRadius: 8, border: 'none', marginBottom: 20, width: 300, color: 'black' }}
        />
        <button 
          onClick={() => setIsOnline(true)}
          style={{ padding: '12px 24px', background: '#34b27b', color: 'white', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer', width: 300 }}
        >
          GO ONLINE
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Top Bar */}
      <div style={{ height: 60, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', color: 'white', zIndex: 1000, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="material-symbols-outlined notranslate" style={{ color: '#34b27b' }}>emergency</span>
          <span style={{ fontWeight: 'bold', fontSize: 18 }}>ResQDrive</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>{activeMission ? 'EN ROUTE' : 'IDLE'}</span>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: activeMission ? '#3b82f6' : '#34b27b' }} />
        </div>
      </div>

      {/* Map Area */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={currentLocation} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          
          <Marker position={currentLocation} icon={vehicleIcon}>
            <Popup>You are here</Popup>
          </Marker>
          
          {activeMission && <RoutingMachine waypoints={waypoints} />}
          
          {/* Target Marker */}
          {activeMission && (
            <Marker position={[activeMission.dropoff_lat, activeMission.dropoff_lng]}>
              <Popup>Destination</Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Incoming Ping Overlay */}
        <AnimatePresence>
          {incomingPing && !activeMission && (
            <motion.div 
              initial={{ y: 200, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              style={{ position: 'absolute', bottom: 40, left: 20, right: 20, background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', zIndex: 1000 }}
            >
              <h3 style={{ margin: '0 0 10px 0', fontSize: 20, fontWeight: 'bold', color: '#ef4444' }}>🚨 New Dispatch Request</h3>
              <p style={{ margin: '0 0 5px 0' }}><strong>Type:</strong> {incomingPing.type}</p>
              {incomingPing.pickup_address && <p style={{ margin: '0 0 5px 0' }}><strong>Pickup:</strong> {incomingPing.pickup_address}</p>}
              <p style={{ margin: '0 0 15px 0' }}><strong>Destination:</strong> {incomingPing.dropoff_address || 'Disaster Zone'}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleAcceptMission} style={{ flex: 1, padding: 12, background: '#34b27b', color: 'white', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>ACCEPT</button>
                <button onClick={() => setIncomingPing(null)} style={{ flex: 1, padding: 12, background: '#ef4444', color: 'white', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>REJECT</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Active Mission Overlay */}
        {activeMission && (
          <div style={{ position: 'absolute', bottom: 40, left: 20, right: 20, background: 'white', padding: 20, borderRadius: 16, boxShadow: '0 10px 25px rgba(0,0,0,0.2)', zIndex: 1000 }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: 20, fontWeight: 'bold', color: '#3b82f6' }}>🗺 En Route</h3>
            <p style={{ margin: '0 0 15px 0' }}>Follow the blue path to the destination.</p>
            <button onClick={handleCompleteMission} style={{ width: '100%', padding: 12, background: '#0f172a', color: 'white', borderRadius: 8, fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>MARK COMPLETED</button>
          </div>
        )}
      </div>
    </div>
  );
}
