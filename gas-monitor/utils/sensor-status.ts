import { SensorStatus, StatusColors } from '@/constants/theme';

export function getSensorStatus(
  value: number,
  warnThreshold: number,
  dangerThreshold: number
): SensorStatus {
  if (value >= dangerThreshold) return 'danger';
  if (value >= warnThreshold) return 'warning';
  return 'safe';
}

export function getStatusColor(status: SensorStatus): string {
  return StatusColors[status];
}

export function getStatusLabel(status: SensorStatus): 'Safe' | 'Warning' | 'Danger' | 'Unknown' {
  const labels = {
    safe: 'Safe',
    warning: 'Warning',
    danger: 'Danger',
    unknown: 'Unknown',
  } as const;
  return labels[status];
}
