'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { deviceApi, DeviceConfig, DeviceCommandResult, SensorReading, ApiRequestError } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { AlertCircle, Check, Gauge, Thermometer, Weight } from 'lucide-react';

type Notice = { kind: 'ok' | 'error'; text: string };

function NoticeLine({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return notice.kind === 'ok' ? (
    <span className="flex items-center gap-2 text-xs text-green-700 font-medium" aria-live="polite">
      <Check className="h-4 w-4" />
      {notice.text}
    </span>
  ) : (
    <div className="text-sm text-destructive flex items-start gap-2" role="alert">
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>{notice.text}</div>
    </div>
  );
}

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiRequestError || err instanceof Error ? err.message : fallback;
}

function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
      <h2 className="text-xl font-semibold text-foreground mb-2">{title}</h2>
      <p className="text-sm text-muted-foreground mb-6">{description}</p>
      {children}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 p-4">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary mb-2" aria-hidden="true">
        {icon}
      </span>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold text-foreground font-mono">{value}</p>
    </div>
  );
}

export default function DevicePage() {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  const [reading, setReading] = useState<SensorReading | null>(null);
  const [readingBusy, setReadingBusy] = useState(false);
  const [readingNotice, setReadingNotice] = useState<Notice | null>(null);

  const [tareBusy, setTareBusy] = useState(false);
  const [tareNotice, setTareNotice] = useState<Notice | null>(null);

  const [level, setLevel] = useState('1');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [levelBusy, setLevelBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [locationBusy, setLocationBusy] = useState(false);
  const [levelNotice, setLevelNotice] = useState<Notice | null>(null);
  const [phoneNotice, setPhoneNotice] = useState<Notice | null>(null);
  const [locationNotice, setLocationNotice] = useState<Notice | null>(null);

  useEffect(() => {
    let cancelled = false;
    deviceApi
      .getConfig()
      .then((c) => {
        if (cancelled) return;
        setConfig(c);
        setLevel(String(c.minimumLevel ?? 1));
        setPhone(c.phoneNumber ?? '');
        setLocation(c.location ?? '');
      })
      .catch((err) => {
        if (!cancelled) setConfigError(errorText(err, 'Could not load your device settings.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Runs one device command and reports the outcome on its own notice line.
  async function runCommand(
    setBusy: (b: boolean) => void,
    setNotice: (n: Notice | null) => void,
    command: () => Promise<DeviceCommandResult>,
    fallback: string
  ) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await command();
      setNotice({ kind: 'ok', text: result.data?.mode === 'MOCK' ? 'Saved (simulated — SMS gateway not configured)' : 'Command sent' });
    } catch (err) {
      setNotice({ kind: 'error', text: errorText(err, fallback) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setReadingBusy(true);
    setReadingNotice(null);
    try {
      setReading(await deviceApi.getReading());
    } catch (err) {
      setReadingNotice({ kind: 'error', text: errorText(err, 'Could not read the sensor.') });
    } finally {
      setReadingBusy(false);
    }
  }

  function handleLevelSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(level);
    if (!Number.isInteger(n) || n < 1 || n > 9) {
      setLevelNotice({ kind: 'error', text: 'Enter a whole number of kg between 1 and 9.' });
      return;
    }
    runCommand(setLevelBusy, setLevelNotice, () => deviceApi.setMinimumLevel(n), 'Could not set the critical level.');
  }

  function handlePhoneSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^0[0-9]{9,}$/.test(phone.trim())) {
      setPhoneNotice({ kind: 'error', text: 'Enter a phone number starting with 0, e.g. 08012345678.' });
      return;
    }
    runCommand(setPhoneBusy, setPhoneNotice, () => deviceApi.setPhoneNumber(phone.trim()), 'Could not set the alert number.');
  }

  function handleLocationSubmit(e: FormEvent) {
    e.preventDefault();
    if (!location.trim() || location.trim().length > 100) {
      setLocationNotice({ kind: 'error', text: 'Enter a location of up to 100 characters.' });
      return;
    }
    runCommand(setLocationBusy, setLocationNotice, () => deviceApi.setLocation(location.trim()), 'Could not set the location.');
  }

  const simulated = reading?.mode === 'mock';

  return (
    <div className="space-y-6 max-w-3xl">
      {configError && (
        <div
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div>{configError}</div>
        </div>
      )}

      <Card
        title="Sensor reading"
        description="Asks your 4FG sensor for its current weight. Each request is sent to the device by SMS, so readings are on demand."
      >
        {reading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Stat icon={<Weight className="h-4 w-4" />} label="Weight" value={`${reading.weight} kg`} />
            <Stat
              icon={<Thermometer className="h-4 w-4" />}
              label="Temperature"
              value={reading.temperature != null ? `${reading.temperature} °C` : '—'}
            />
            <Stat
              icon={<Gauge className="h-4 w-4" />}
              label="Pressure"
              value={reading.pressure != null ? `${reading.pressure} bar` : '—'}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">No reading yet.</p>
        )}

        {simulated && (
          <p className="text-xs text-amber-700 bg-amber-100/50 rounded-lg px-3 py-2 mb-4">
            These numbers are simulated. The SMS gateway isn&apos;t configured on the server, so no real sensor was queried.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="primary" size="sm" disabled={readingBusy} onClick={handleRefresh}>
            {readingBusy ? 'Reading…' : reading ? 'Refresh reading' : 'Get reading'}
          </Button>
          {reading && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(reading.timestamp).toLocaleTimeString()}
            </span>
          )}
          <NoticeLine notice={readingNotice} />
        </div>
      </Card>

      <Card
        title="Alert settings"
        description="Where the device texts you, and when it counts the cylinder as running low."
      >
        <div className="space-y-6">
          <form onSubmit={handleLevelSubmit} noValidate className="space-y-3">
            <Input
              label="Critical level (kg)"
              id="minimumLevel"
              type="number"
              value={level}
              onChange={setLevel}
              error={false}
              min={1}
              max={9}
              step={1}
              classNames={{ root: 'w-full sm:w-64' }}
            />
            <p className="text-xs text-muted-foreground">Whole kilograms, 1–9. You&apos;re alerted when the cylinder drops to this weight.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="sm" disabled={levelBusy || !config}>
                {levelBusy ? 'Sending…' : 'Save level'}
              </Button>
              <NoticeLine notice={levelNotice} />
            </div>
          </form>

          <form onSubmit={handlePhoneSubmit} noValidate className="space-y-3 pt-6 border-t border-border">
            <Input
              label="Alert phone number"
              id="alertPhone"
              type="tel"
              value={phone}
              onChange={setPhone}
              placeholder="08012345678"
              error={false}
              classNames={{ root: 'w-full sm:w-64' }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="sm" disabled={phoneBusy || !config}>
                {phoneBusy ? 'Sending…' : 'Save number'}
              </Button>
              <NoticeLine notice={phoneNotice} />
            </div>
          </form>

          <form onSubmit={handleLocationSubmit} noValidate className="space-y-3 pt-6 border-t border-border">
            <Input
              label="Device location"
              id="deviceLocation"
              type="text"
              value={location}
              onChange={setLocation}
              placeholder="Kitchen, Owerri"
              error={false}
              classNames={{ root: 'w-full sm:w-96' }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="primary" size="sm" disabled={locationBusy || !config}>
                {locationBusy ? 'Sending…' : 'Save location'}
              </Button>
              <NoticeLine notice={locationNotice} />
            </div>
          </form>
        </div>
      </Card>

      <Card
        title="Calibration"
        description="Zero the scale. Do this with the cylinder off the sensor, otherwise readings will be offset."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={tareBusy}
            onClick={() => runCommand(setTareBusy, setTareNotice, deviceApi.tare, 'Could not calibrate the sensor.')}
          >
            {tareBusy ? 'Sending…' : 'Tare scale'}
          </Button>
          <NoticeLine notice={tareNotice} />
        </div>
      </Card>
    </div>
  );
}
