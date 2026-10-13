import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { useAvailability } from './hooks/use-availability';
import { apiClient } from './lib/api-client';
import type { Activity, DemoUser } from './types/models';
import './styles.css';

const previewUsers: DemoUser[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    displayName: 'Ada — Host',
    role: 'host',
    featureVariant: 'treatment',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    displayName: 'Ben — Booker',
    role: 'booker',
    featureVariant: 'treatment',
  },
];
const previewActivities: Activity[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    title: 'Sunset Kayaking',
    description: 'A calm golden-hour paddle with a small local group.',
    starts_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    price_cents: 4500,
    capacity: 8,
    available_spots: 8,
    host_name: 'Ada — Host',
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    title: 'Secret Speakeasy Tour',
    description: 'Follow the clues through hidden Lagos cocktail rooms.',
    starts_at: new Date(Date.now() + 9 * 86400000).toISOString(),
    price_cents: 6500,
    capacity: 4,
    available_spots: 4,
    host_name: 'Ada — Host',
  },
];

type Metrics = {
  slo: {
    noOversell: boolean;
    maxOversoldBookings: number;
    qualifiedBookingSuccessRate: number | null;
    soldOutRejections: number;
    availabilityP95Ms: number | null;
  };
  product: {
    bookerInviteRate: number | null;
    inviteOpenToClaimRate: number | null;
    kFactorByRail: Array<{ rail: string; claims: number; invites: number }>;
  };
};

function formatPercent(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<ActivityPage />} />
      <Route path="/metrics" element={<MetricsRoute />} />
    </Routes>
  );
}

function ActivityPage() {
  const qc = useQueryClient();
  const [user, setUser] = useState<DemoUser | null>(null);
  const [selected, setSelected] = useState<Activity | null>(null);
  const [bookedActivityIds, setBookedActivityIds] = useState<Set<string>>(() => new Set());
  const [inviteCodesByActivity, setInviteCodesByActivity] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const activities = useQuery<Activity[]>({
    queryKey: ['activities'],
    queryFn: () => apiClient<Activity[]>('/activities').catch(() => previewActivities),
  });
  const users = useQuery<DemoUser[]>({
    queryKey: ['users'],
    queryFn: () =>
      apiClient<DemoUser[]>('/demo-users')
        .then((users) =>
          users.filter(
            (candidate) => candidate.role !== 'guest' && candidate.featureVariant !== 'holdout',
          ),
        )
        .catch(() => previewUsers),
  });
  useEffect(() => {
    if (users.data && !user) setUser(users.data.find((x) => x.role === 'booker') || users.data[0]);
  }, [users.data, user]);
  useEffect(() => {
    if (!user) return;
    void apiClient('/feature-exposure', {
      method: 'POST',
      body: JSON.stringify({ userId: user.id }),
    }).catch(() => undefined);
  }, [user]);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!selectedId || !activities.data) return;
    const refreshed = activities.data.find((activity) => activity.id === selectedId);
    if (refreshed) setSelected(refreshed);
  }, [activities.data, selectedId]);
  useAvailability(selected?.id, qc);
  const book = useMutation({
    mutationFn: () =>
      apiClient<{ activity: Activity }>(`/activities/${selected!.id}/book`, {
        method: 'POST',
        body: JSON.stringify({ userId: user!.id }),
      }),
    onSuccess: (data: { activity: Activity }) => {
      setBookedActivityIds((ids) => new Set(ids).add(selected!.id));
      setSelected(data.activity);
      setMessage('You are in. Your plan is ready for invites.');
      qc.invalidateQueries({ queryKey: ['activities'] });
    },
    onError: (e: Error) => setMessage(e.message),
  });
  const createInvite = useMutation({
    mutationFn: () =>
      apiClient<{ activityId: string; code: string }>(`/activities/${selected!.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          inviterId: user!.id,
          rail: 'public',
        }),
      }),
    onSuccess: (data) => {
      setInviteCodesByActivity((codes) => ({
        ...codes,
        [data.activityId]: data.code,
      }));
      setMessage('Share code created. Send it to friends so they can join from the mobile app.');
    },
    onError: (e: Error) => setMessage(e.message),
  });
  if (!user)
    return (
      <main>
        <p>Loading demo identities...</p>
      </main>
    );
  return (
    <main>
      <header>
        <div>
          <small>VELIO / LIVE GROUP BOOKING</small>
          <h1>Make the plan real.</h1>
        </div>
        <div className="header-actions">
          <Link className="button" to="/metrics">
            View metrics
          </Link>
          <select
            aria-label="Demo identity"
            value={user.id}
            onChange={(e) => {
              setUser(users.data?.find((x) => x.id === e.target.value) || user);
              setSelected(null);
              setBookedActivityIds(new Set());
              setMessage('');
            }}
          >
            {users.data?.map((x) => (
              <option value={x.id} key={x.id}>
                {x.displayName}
              </option>
            ))}
          </select>
        </div>
      </header>
      <section className="hero">
        <p>Small-group experiences, with a clear signal when there is still room.</p>
        <p>Book an activity, then share your code with friends while spots remain.</p>
      </section>
      {user.role === 'host' && (
        <section className="new-activity">
          <div>
            <small>HOST TOOLS</small>
            <h2>Create a new activity</h2>
          </div>
          <CreateActivity
            user={user}
            refresh={() => qc.invalidateQueries({ queryKey: ['activities'] })}
          />
        </section>
      )}
      {message && <p className="notice">{message}</p>}
      <div className="layout">
        <aside>
          <h2>Upcoming</h2>
          {activities.isLoading ? (
            <p>Finding plans...</p>
          ) : (
            activities.data?.map((a) => (
              <button
                className={'activity ' + (selected?.id === a.id ? 'selected' : '')}
                key={a.id}
                onClick={() => setSelected(a)}
              >
                <strong>{a.title}</strong>
                <span>
                  {new Date(a.starts_at).toLocaleDateString()} · {a.available_spots} spots left
                </span>
              </button>
            ))
          )}
        </aside>
        {selected && (
          <Card>
            <p className="eyebrow">HOSTED BY {selected.host_name.toUpperCase()}</p>
            <h2>{selected.title}</h2>
            <p>{selected.description}</p>
            <div className="facts">
              <b>NGN {(selected.price_cents / 100).toFixed(2)}</b>
              <b>
                {selected.available_spots}/{selected.capacity} available
              </b>
            </div>
            {user.role === 'booker' && !bookedActivityIds.has(selected.id) && (
              <Button
                className="primary"
                disabled={book.isPending || selected.available_spots === 0}
                onClick={() => book.mutate()}
              >
                {selected.available_spots ? 'Book a spot' : 'Sold out'}
              </Button>
            )}
            {user.role === 'booker' && bookedActivityIds.has(selected.id) && (
              <div className="invite">
                <h3>Bring your people</h3>
                <p>Your code works until the activity starts or all spots are taken.</p>
                <Button
                  disabled={createInvite.isPending || selected.available_spots === 0}
                  onClick={() => {
                    const code = inviteCodesByActivity[selected.id];
                    if (code) {
                      void navigator.clipboard.writeText(code);
                      setMessage('Share code copied.');
                    } else createInvite.mutate();
                  }}
                >
                  {inviteCodesByActivity[selected.id] ? (
                    <>
                      {inviteCodesByActivity[selected.id]}{' '}
                      <Copy aria-label="Copy share code" size={16} />
                    </>
                  ) : (
                    'Generate a share code'
                  )}
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}

function MetricsRoute() {
  const metrics = useQuery<Metrics>({
    queryKey: ['metrics'],
    queryFn: () => apiClient<Metrics>('/metrics'),
  });
  return <MetricsPage metrics={metrics.data} loading={metrics.isLoading} error={metrics.error} />;
}

function MetricsPage({
  metrics,
  loading,
  error,
}: {
  metrics?: Metrics;
  loading: boolean;
  error: Error | null;
}) {
  if (loading) return <p className="notice">Loading metrics…</p>;
  if (error || !metrics)
    return <p className="notice">Metrics are unavailable. Ensure the API is running.</p>;
  return (
    <main className="metrics-page">
      <header>
        <div>
          <small>VELIO / LIVE GROUP BOOKING</small>
          <h1>Activity metrics</h1>
        </div>
        <Link className="button" to="/">
          Back to activities
        </Link>
      </header>
      <div className="hero">
        <small>LIVE PERFORMANCE</small>
        <p>Booking reliability, availability delivery, and share-code conversion.</p>
      </div>
      <div className="metric-grid">
        <Metric label="Capacity protected" value={metrics.slo.noOversell ? 'Yes' : 'No'} />
        <Metric
          label="Booking success"
          value={formatPercent(metrics.slo.qualifiedBookingSuccessRate)}
        />
        <Metric label="Sold-out rejections" value={String(metrics.slo.soldOutRejections)} />
        <Metric
          label="Availability p95"
          value={
            metrics.slo.availabilityP95Ms === null ? '—' : `${metrics.slo.availabilityP95Ms} ms`
          }
        />
        <Metric
          label="Bookers who shared"
          value={formatPercent(metrics.product.bookerInviteRate)}
        />
        <Metric
          label="Invite open → join"
          value={formatPercent(metrics.product.inviteOpenToClaimRate)}
        />
      </div>
      <Card className="rail-card">
        <p className="eyebrow">SHARE CODE PERFORMANCE</p>
        {(metrics.product.kFactorByRail ?? []).map((rail) => (
          <div className="rail-row" key={rail.rail}>
            <b>{rail.rail}</b>
            <span>{rail.invites} codes created</span>
            <span>{rail.claims} joins</span>
          </div>
        ))}
      </Card>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="metric-card">
      <small>{label.toUpperCase()}</small>
      <strong>{value}</strong>
    </Card>
  );
}

function CreateActivity({ user, refresh }: { user: DemoUser; refresh: () => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() =>
    new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
  );
  const [amount, setAmount] = useState(50);
  const [capacity, setCapacity] = useState(10);
  const m = useMutation({
    mutationFn: () =>
      apiClient('/activities', {
        method: 'POST',
        body: JSON.stringify({
          hostId: user.id,
          title,
          description: 'A thoughtful small-group experience.',
          startsAt: new Date(`${date}T18:00:00`).toISOString(),
          priceCents: Math.round(amount * 100),
          capacity,
        }),
      }),
    onSuccess: () => {
      setTitle('');
      refresh();
    },
  });
  return (
    <form
      className="create"
      onSubmit={(event) => {
        event.preventDefault();
        m.mutate();
      }}
    >
      <label>
        Activity name
        <input
          placeholder="e.g. Sunset Kayaking"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label>
        Amount (NGN)
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
        />
      </label>
      <label>
        Available spots
        <input
          type="number"
          min="1"
          value={capacity}
          onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
        />
      </label>
      <button type="submit" className="primary" disabled={title.length < 3 || !date || m.isPending}>
        Create activity
      </button>
    </form>
  );
}
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>
  </BrowserRouter>,
);
