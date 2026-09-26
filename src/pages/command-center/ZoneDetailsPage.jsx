import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useZonesSummary, useEscalatedTasks } from '../../api/useCommandCenter';
import { ZoneCard } from '../../components/command-center/ZoneCard';
import { EscalationTable } from '../../components/command-center/EscalationTable';
import styles from '../../components/command-center/CommandCenter.module.css';
import { io } from 'socket.io-client';

export function ZoneDetailsPage() {
  const { id } = useParams();
  const { data: zonesData, isLoading, error } = useZonesSummary();
  const zone = (Array.isArray(zonesData) ? zonesData : []).find(
    (z) => String(z.zone_id || z.id) === String(id),
  );

  const { data: escalatedData } = useEscalatedTasks({ zone: id, sort: 'delay_desc' });
  const escalated = Array.isArray(escalatedData) ? escalatedData : [];
  
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchType, setDispatchType] = useState('Ambulance');

  const handleDispatch = async () => {
    // Send to backend
    try {
      const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:3000');
      // Fire REST request
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/fleet/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: dispatchType,
          dropoff_lat: zone?.latitude || zone?.lat || 18.5204,
          dropoff_lng: zone?.longitude || zone?.lng || 73.8567,
          dropoff_address: zone?.zone_name || zone?.name || 'Disaster Zone',
          notes: 'Emergency Request from Team Lead'
        })
      });
      const data = await res.json();
      
      // Ping all drivers
      socket.emit('fleet.dispatch.request', data);
      setTimeout(() => socket.close(), 1000);
      
      alert(`Dispatched ${dispatchType} to ${zone?.name || 'Zone'}!`);
      setShowDispatchModal(false);
    } catch (err) {
      console.error(err);
      alert('Failed to dispatch fleet');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Zone Details</h1>
          <p className={styles.subtitle}>Detailed command metrics for selected zone.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button 
            onClick={() => setShowDispatchModal(true)}
            style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined notranslate" style={{ fontSize: 18 }}>emergency</span>
            Dispatch Fleet
          </button>
          <Link className={styles.button} to="/zones">Back to Zones</Link>
        </div>
      </div>

      {isLoading && <div className={`${styles.card} ${styles.skeleton}`} style={{ height: 230 }} />}
      {error && <div className={styles.card} style={{ color: 'var(--color-danger)' }}>{error.message}</div>}
      {!isLoading && !error && !zone && <div className={styles.card}>Zone not found.</div>}

      {zone && (
        <>
          <ZoneCard zone={zone} />
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Escalated Tasks in This Zone</h3>
            <div style={{ marginTop: 10 }}>
              <EscalationTable rows={escalated} />
            </div>
          </div>
        </>
      )}

      {/* Dispatch Modal */}
      {showDispatchModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--color-surface, #ffffff)', padding: '32px', borderRadius: '16px', width: '400px', color: 'var(--color-text-primary, #0f172a)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--color-border, #e2e8f0)' }}>
            <h2 style={{ margin: '0 0 24px 0', display: 'flex', alignItems: 'center', gap: 10, fontSize: '20px' }}>
              <span className="material-symbols-outlined notranslate" style={{ color: '#ef4444', backgroundColor: '#fef2f2', padding: '8px', borderRadius: '50%' }}>emergency</span>
              Emergency Dispatch
            </h2>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', marginBottom: 8, fontSize: '14px', fontWeight: '600', color: 'var(--color-text-secondary, #475569)' }}>Select Vehicle Type:</label>
              <select 
                value={dispatchType} 
                onChange={e => setDispatchType(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--color-border, #cbd5e1)', backgroundColor: 'transparent', color: 'inherit', fontSize: '15px', outline: 'none' }}
              >
                <option value="Ambulance">🚑 Ambulance</option>
                <option value="Fire Truck">🚒 Fire Truck</option>
                <option value="Supply Truck">🚚 Supply Truck</option>
              </select>
            </div>
            <div style={{ marginBottom: 32, padding: '12px', backgroundColor: 'var(--color-bg, #f8fafc)', borderRadius: '8px', border: '1px solid var(--color-border, #e2e8f0)' }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: '12px', fontWeight: 'bold', color: 'var(--color-text-muted, #94a3b8)', textTransform: 'uppercase' }}>Destination</label>
              <p style={{ margin: 0, fontWeight: '500', fontSize: '15px' }}>{zone?.zone_name || zone?.name || 'Unknown Zone'}</p>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                onClick={() => setShowDispatchModal(false)}
                style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: '1px solid var(--color-border, #cbd5e1)', color: 'var(--color-text-secondary, #475569)', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                Cancel
              </button>
              <button 
                onClick={handleDispatch}
                style={{ flex: 1, padding: '12px', backgroundColor: '#ef4444', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3)', transition: 'all 0.2s' }}
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
