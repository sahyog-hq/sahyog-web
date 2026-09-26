import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { apiRequest } from '../lib/api';

const API = import.meta.env.VITE_API_URL || '';

// ─── Relief Zones ────────────────────────────────────────────────────

export function useReliefZones(disasterId) {
    const { getToken, isSignedIn } = useAuth();
    return useQuery({
        queryKey: ['relief-zones', disasterId],
        queryFn: () => apiRequest(`/api/v1/disasters/${disasterId}/relief-zones`, {}, getToken),
        enabled: isSignedIn === true && !!disasterId,
    });
}

export function useCreateZone(disasterId) {
    const { getToken } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiRequest(`/api/v1/disasters/${disasterId}/relief-zones`, {
            method: 'POST', body: JSON.stringify(data),
        }, getToken),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['relief-zones', disasterId] }),
    });
}

export function useDeleteZone(disasterId) {
    const { getToken } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (zoneId) => apiRequest(`/api/v1/disasters/${disasterId}/relief-zones/${zoneId}`, {
            method: 'DELETE',
        }, getToken),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['relief-zones', disasterId] }),
        onError: (error) => {
            // Handle zone deletion protection error
            if (error.status === 400 && error.details?.active_tasks !== undefined) {
                const { active_tasks, active_volunteers, active_coordinators, deployed_resources } = error.details;
                const totalActive = active_tasks + active_volunteers + active_coordinators + deployed_resources;
                throw new Error(
                    `Cannot delete zone with ${totalActive} active assignment(s). ` +
                    `Active: ${active_tasks} tasks, ${active_volunteers} volunteers, ` +
                    `${active_coordinators} coordinators, ${deployed_resources} resources. ` +
                    `Reassign or complete all activities first.`
                );
            }
            throw error;
        }
    });
}

// ─── Resource Requests ───────────────────────────────────────────────

export function useDisasterRequests(disasterId) {
    const { getToken, isSignedIn } = useAuth();
    return useQuery({
        queryKey: ['disaster-requests', disasterId],
        queryFn: () => apiRequest(`/api/v1/disasters/${disasterId}/requests`, {}, getToken),
        enabled: isSignedIn === true && !!disasterId,
    });
}

export function useCreateRequest(disasterId) {
    const { getToken } = useAuth();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data) => apiRequest(`/api/v1/disasters/${disasterId}/requests`, {
            method: 'POST', body: JSON.stringify(data),
        }, getToken),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['disaster-requests', disasterId] }),
    });
}

// ─── Org list (for admin to select recipients) ───────────────────────

export function useInventoryLocations() {
    const { getToken, isSignedIn } = useAuth();
    return useQuery({
        queryKey: ['inventory-locations'],
        queryFn: () => apiRequest('/api/v1/inventory/locations', {}, getToken),
        enabled: isSignedIn === true,
        staleTime: 5 * 60 * 1000,
    });
}

export function useAmbulanceRoute() {
    const { getToken } = useAuth();
    return useMutation({
        mutationFn: (data) => apiRequest('/api/v1/inventory/ambulance-route', {
            method: 'POST',
            body: JSON.stringify(data),
        }, getToken),
    });
}

export function useAllOrganizations() {
    const { getToken, isSignedIn } = useAuth();
    return useQuery({
        queryKey: ['all-organizations'],
        queryFn: () => apiRequest('/api/v1/organizations/list', {}, getToken),
        enabled: isSignedIn === true,
    });
}
