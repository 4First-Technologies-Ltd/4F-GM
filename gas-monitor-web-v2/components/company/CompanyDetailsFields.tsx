'use client';

import { Input } from '@/components/motion/input';
import { StateCityFields } from '@/components/vendor/StateCityFields';

/** Company name, phone, address and location: shared by sign-up and the "finish setup" form. */
export function CompanyDetailsFields({
  companyName,
  phone,
  address,
  state,
  city,
  onCompanyNameChange,
  onPhoneChange,
  onAddressChange,
  onStateChange,
  onCityChange,
  disabled
}: {
  companyName: string;
  phone: string;
  address: string;
  state: string;
  city: string;
  onCompanyNameChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  onAddressChange: (v: string) => void;
  onStateChange: (v: string) => void;
  onCityChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Input
        label="Company name"
        id="companyName"
        type="text"
        required
        value={companyName}
        onChange={onCompanyNameChange}
        error={false}
        placeholder="Swift Dispatch Ltd."
        classNames={{ root: 'w-full' }}
      />

      <Input
        label="Company phone"
        id="companyPhone"
        type="tel"
        autoComplete="tel"
        required
        value={phone}
        onChange={onPhoneChange}
        error={false}
        placeholder="0801 234 5678"
        classNames={{ root: 'w-full' }}
      />

      <Input
        label="Company address"
        id="companyAddress"
        type="text"
        required
        minLength={5}
        value={address}
        onChange={onAddressChange}
        error={false}
        placeholder="Street address"
        classNames={{ root: 'w-full' }}
      />

      <StateCityFields
        state={state}
        city={city}
        onStateChange={onStateChange}
        onCityChange={onCityChange}
        disabled={disabled}
      />
    </>
  );
}
