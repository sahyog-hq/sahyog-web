import { useState, useEffect, useCallback, useRef } from 'react';
import { useRealtime } from '../components/RealtimeProvider';

/**
 * useLiveLocations — subscribes to real-time location updates via Socket.io.
 *
 * Returns:
 *  - locations: Map<maskedUserId, {role, lat, lng, name, timestamp}>
 *  - volunteers / coordinators / citizens: filtered arrays
 *  - count: total active users
 */
export function useLiveLocations() {
    const { socket } = useRealtime();
    const [locations, setLocations] = useState(new Map());
    const expiryTimers = useRef(new Map());

    const EXPIRY_MS = 60 * 1000; // 60s without update → remove marker

    const handleUpdate = useCallback((data) => {
        if (!data || !data.lat || !data.lng) return;

        const key = data.userId || `${data.lat}-${data.lng}`;

        setLocations(prev => {
            const next = new Map(prev);
            next.set(key, {
                userId: data.userId,
                role: data.role || 'unknown',
                lat: parseFloat(data.lat),
                lng: parseFloat(data.lng),
                name: data.name || '',
                timestamp: data.timestamp || Date.now(),
            });
            return next;
        });

        // Reset expiry timer for this user
        if (expiryTimers.current.has(key)) {
            clearTimeout(expiryTimers.current.get(key));
        }
        expiryTimers.current.set(key, setTimeout(() => {
            setLocations(prev => {
                const next = new Map(prev);
                next.delete(key);
                return next;
            });
            expiryTimers.current.delete(key);
        }, EXPIRY_MS));
    }, []);

    useEffect(() => {
        if (!socket) return;

        socket.on('location.update', handleUpdate);

        return () => {
            socket.off('location.update', handleUpdate);
            // Clean up all expiry timers
            expiryTimers.current.forEach(t => clearTimeout(t));
            expiryTimers.current.clear();
        };
    }, [socket, handleUpdate]);

    const all = Array.from(locations.values());

    return {
        locations,
        all,
        volunteers: all.filter(l => l.role === 'volunteer' || l.role === 'vehicle'),
        coordinators: all.filter(l => l.role === 'coordinator'),
        citizens: all.filter(l => l.role === 'citizen'),
        count: all.length,
    };
}
