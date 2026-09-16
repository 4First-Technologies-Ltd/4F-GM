'use client';

import { useState } from 'react';
import { citiesIn, STATE_NAMES } from '@/lib/nigeria';

const OTHER = '__other__';

const fieldClass =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-colors disabled:opacity-50';

interface StateCityFieldsProps {
  state: string;
  city: string;
  onStateChange: (state: string) => void;
  onCityChange: (city: string) => void;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Where a vendor trades from, used by the marketplace state → city filter.
 * Cities come from the same list the filter uses; "Other" allows a town that
 * list doesn't carry, typed by hand.
 */
export function StateCityFields({
  state,
  city,
  onStateChange,
  onCityChange,
  required = false,
  disabled = false
}: StateCityFieldsProps) {
  const cities = state ? citiesIn(state) : [];
  // A saved city outside the list (typed earlier via "Other") opens in that mode.
  const [otherCity, setOtherCity] = useState(() => Boolean(city) && !cities.includes(city));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor="vendor-state" className="block text-sm font-medium text-foreground mb-2">
          State {required && <span className="text-destructive">*</span>}
        </label>
        <select
          id="vendor-state"
          value={state}
          required={required}
          disabled={disabled}
          onChange={(e) => {
            // A city only means something inside its state.
            onStateChange(e.target.value);
            onCityChange('');
            setOtherCity(false);
          }}
          className={fieldClass}
        >
          <option value="">Select state</option>
          {STATE_NAMES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vendor-city" className="block text-sm font-medium text-foreground mb-2">
          City {required && <span className="text-destructive">*</span>}
        </label>
        <select
          id="vendor-city"
          value={otherCity ? OTHER : city}
          required={required}
          disabled={disabled || !state}
          onChange={(e) => {
            const other = e.target.value === OTHER;
            setOtherCity(other);
            onCityChange(other ? '' : e.target.value);
          }}
          className={fieldClass}
        >
          <option value="">{state ? 'Select city' : 'Pick a state first'}</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {otherCity && (
          <input
            type="text"
            aria-label="City name"
            value={city}
            required={required}
            disabled={disabled}
            minLength={2}
            maxLength={80}
            onChange={(e) => onCityChange(e.target.value)}
            placeholder="Type your city or town"
            className={`${fieldClass} mt-2`}
          />
        )}
      </div>
    </div>
  );
}
