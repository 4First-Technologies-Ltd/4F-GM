'use client';

import { Input } from '@/components/motion/input';
import { VEHICLE_TYPES } from '@/lib/rider';

/** Phone, vehicle type and plate — shared by rider sign-up and the "finish setup" form. */
export function RiderDetailsFields({
  phone,
  vehicleType,
  plateNumber,
  onPhoneChange,
  onVehicleTypeChange,
  onPlateNumberChange,
  disabled
}: {
  phone: string;
  vehicleType: string;
  plateNumber: string;
  onPhoneChange: (v: string) => void;
  onVehicleTypeChange: (v: string) => void;
  onPlateNumberChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Input
        label="Phone number"
        id="riderPhone"
        type="tel"
        autoComplete="tel"
        required
        value={phone}
        onChange={onPhoneChange}
        error={false}
        placeholder="0801 234 5678"
        classNames={{ root: 'w-full' }}
      />

      <fieldset disabled={disabled}>
        <legend className="block text-sm font-medium text-foreground mb-2">Vehicle type</legend>
        <div className="flex flex-wrap gap-2">
          {VEHICLE_TYPES.map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vehicleType === v}
              onClick={() => onVehicleTypeChange(v)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                vehicleType === v
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </fieldset>

      <Input
        label="Plate number (optional)"
        id="plateNumber"
        type="text"
        maxLength={20}
        value={plateNumber}
        onChange={(v) => onPlateNumberChange(v.toUpperCase())}
        error={false}
        placeholder="ABC-123-XY"
        classNames={{ root: 'w-full' }}
      />
    </>
  );
}
