export type Activity = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  price_cents: number;
  capacity: number;
  available_spots: number;
  host_name: string;
};

export type DemoUser = {
  id: string;
  displayName: string;
  role: 'host' | 'booker' | 'guest';
  featureVariant: string;
};
