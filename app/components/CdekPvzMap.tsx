'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CdekPvzPoint } from '@/lib/cdekClient';

const defaultIcon = L.icon({
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.mergeOptions({ icon: defaultIcon });

function FitBounds({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const b = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(b, { padding: [24, 24], maxZoom: 14 });
  }, [map, points]);
  return null;
}

function FlyToRequest({
  target,
}: {
  target: { lat: number; lng: number; token: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], 16, { duration: 0.45 });
  }, [map, target]);
  return null;
}

type Props = {
  points: CdekPvzPoint[];
  selectedCode: string;
  flyTo: { lat: number; lng: number; token: number } | null;
  onPick: (p: CdekPvzPoint) => void;
};

export function CdekPvzMap({ points, selectedCode, flyTo, onPick }: Props) {
  const withCoords = useMemo(
    () =>
      points.filter(
        (p): p is CdekPvzPoint & { lat: number; lng: number } =>
          typeof p.lat === 'number' &&
          typeof p.lng === 'number' &&
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lng)
      ),
    [points]
  );

  const boundsPoints = useMemo(
    () => withCoords.map((p) => ({ lat: p.lat, lng: p.lng })),
    [withCoords]
  );

  const center: [number, number] = useMemo(() => {
    if (withCoords.length === 0) return [55.75, 37.62];
    const lat = withCoords.reduce((s, p) => s + p.lat, 0) / withCoords.length;
    const lng = withCoords.reduce((s, p) => s + p.lng, 0) / withCoords.length;
    return [lat, lng];
  }, [withCoords]);

  if (withCoords.length === 0) {
    return (
      <div
        className="flex h-full min-h-[200px] items-center justify-center bg-[#f0efec] px-4 text-center text-xs text-gray-600"
        style={{ fontFamily: 'var(--font-open-sans)' }}
      >
        Координаты пунктов не пришли от СДЭК — воспользуйтесь поиском и списком справа.
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={12}
      className="h-full min-h-[220px] w-full rounded-sm [&_.leaflet-control-attribution]:text-[10px]"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={boundsPoints} />
      {flyTo ? <FlyToRequest target={flyTo} /> : null}
      {withCoords.map((p) => (
        <Marker
          key={p.code}
          position={[p.lat, p.lng]}
          opacity={selectedCode === p.code ? 1 : 0.82}
          eventHandlers={{
            click: () => onPick(p),
          }}
        >
          <Popup>
            <div className="max-w-[220px] text-xs" style={{ fontFamily: 'var(--font-open-sans)' }}>
              <div className="font-mono text-gray-500">{p.code}</div>
              <div className="mt-0.5 font-medium text-[#0b2a24]">{p.name}</div>
              {p.address ? <div className="mt-1 leading-snug text-gray-600">{p.address}</div> : null}
              <button
                type="button"
                className="mt-2 w-full border border-[#0b2a24] py-1.5 text-[10px] uppercase tracking-wider text-[#0b2a24] hover:bg-[#0b2a24]/5"
                onClick={() => onPick(p)}
              >
                Выбрать пункт
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
