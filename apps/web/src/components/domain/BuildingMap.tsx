import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet's default icon URLs when bundled by Vite
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export interface BuildingMapProps {
  lat?: number | null;
  lng?: number | null;
  name?: string;
  editable?: boolean;
  onLocationChange?: (lat: number, lng: number) => void;
  className?: string;
}

export function BuildingMap({
  lat,
  lng,
  name,
  editable = false,
  onLocationChange,
  className = '',
}: BuildingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // Default coordinates: Chattogram (22.3569, 91.7832)
  const defaultLat = 22.3569;
  const defaultLng = 91.7832;
  const currentLat = lat ?? defaultLat;
  const currentLng = lng ?? defaultLng;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView([currentLat, currentLng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([currentLat, currentLng], {
      draggable: editable,
    }).addTo(map);

    if (name) {
      marker.bindPopup(`<strong>${name}</strong>`);
    }

    if (editable) {
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        onLocationChange?.(pos.lat, pos.lng);
      });

      map.on('click', (e) => {
        marker.setLatLng(e.latlng);
        onLocationChange?.(e.latlng.lat, e.latlng.lng);
      });
    }

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [editable, currentLat, currentLng, name, onLocationChange]);

  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([currentLat, currentLng]);
      mapRef.current.panTo([currentLat, currentLng]);
    }
  }, [currentLat, currentLng]);

  return (
    <div
      ref={containerRef}
      data-testid="building-map"
      aria-label="Building location map"
      className={`w-full h-80 rounded-lg overflow-hidden border border-border z-0 ${className}`}
    />
  );
}
