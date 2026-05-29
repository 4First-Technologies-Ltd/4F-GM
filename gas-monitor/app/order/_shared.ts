export type OrderStatus = 'delivered' | 'processing' | 'cancelled';

export interface TimelineStep {
  label: string;
  time: string;
  done: boolean;
}

export interface HistoryOrder {
  id: string;
  orderId: string;
  supplier: string;
  supplierInitials: string;
  supplierColor: string;
  supplierAddress: string;
  supplierRating: number;
  gasType: string;
  size: string;
  quantity: number;
  unitPrice: number;
  total: number;
  deliveryFee: number;
  deliveryAddress: string;
  paymentMethod: string;
  date: string;
  time: string;
  status: OrderStatus;
  timeline: TimelineStep[];
}

export const STATUS_META: Record<OrderStatus, { label: string; color: string; bg: string; border: string }> = {
  delivered:  { label: 'Delivered',  color: '#2D7450', bg: '#E8F5E8', border: '#2D745040' },
  processing: { label: 'Processing', color: '#E65100', bg: '#FFF3E0', border: '#E6510040' },
  cancelled:  { label: 'Cancelled',  color: '#D32F2F', bg: '#FFEBEE', border: '#D32F2F40' },
};

export function fmtPrice(n: number) {
  return '₦' + n.toLocaleString();
}

export const MOCK_ORDERS: HistoryOrder[] = [
  {
    id: '1',
    orderId: 'ORD-0001',
    supplier: 'Ardova Gas Ltd',
    supplierInitials: 'AG',
    supplierColor: '#2D7450',
    supplierAddress: '14 Admiralty Way, Lekki Phase 1',
    supplierRating: 4.8,
    gasType: 'Cooking Gas',
    size: '12.5 kg',
    quantity: 2,
    unitPrice: 8500,
    total: 17000,
    deliveryFee: 0,
    deliveryAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
    paymentMethod: 'Card — •••• 4242',
    date: 'May 27, 2026',
    time: '10:32 AM',
    status: 'delivered',
    timeline: [
      { label: 'Order placed',      time: '10:32 AM', done: true  },
      { label: 'Confirmed',         time: '10:35 AM', done: true  },
      { label: 'Out for delivery',  time: '11:14 AM', done: true  },
      { label: 'Delivered',         time: '11:58 AM', done: true  },
    ],
  },
  {
    id: '2',
    orderId: 'ORD-0002',
    supplier: 'HomeGas Express',
    supplierInitials: 'HG',
    supplierColor: '#2D7450',
    supplierAddress: '18 Bode Thomas St, Surulere',
    supplierRating: 4.3,
    gasType: 'Cooking Gas',
    size: '6 kg',
    quantity: 1,
    unitPrice: 4500,
    total: 4500,
    deliveryFee: 0,
    deliveryAddress: '3 Broad St, Lagos Marina, Lagos Island',
    paymentMethod: 'Cash on delivery',
    date: 'May 20, 2026',
    time: '2:15 PM',
    status: 'delivered',
    timeline: [
      { label: 'Order placed',      time: '2:15 PM', done: true  },
      { label: 'Confirmed',         time: '2:18 PM', done: true  },
      { label: 'Out for delivery',  time: '3:02 PM', done: true  },
      { label: 'Delivered',         time: '3:44 PM', done: true  },
    ],
  },
  {
    id: '3',
    orderId: 'ORD-0003',
    supplier: 'Total Gas Depot',
    supplierInitials: 'TG',
    supplierColor: '#E65100',
    supplierAddress: '5 Kingsway Rd, Ikoyi',
    supplierRating: 4.5,
    gasType: 'Bulk LPG',
    size: '50 kg',
    quantity: 1,
    unitPrice: 32000,
    total: 32000,
    deliveryFee: 0,
    deliveryAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
    paymentMethod: 'Card — •••• 4242',
    date: 'May 15, 2026',
    time: '9:05 AM',
    status: 'cancelled',
    timeline: [
      { label: 'Order placed',      time: '9:05 AM',  done: true  },
      { label: 'Confirmed',         time: '',         done: false },
      { label: 'Out for delivery',  time: '',         done: false },
      { label: 'Delivered',         time: '',         done: false },
    ],
  },
  {
    id: '4',
    orderId: 'ORD-0004',
    supplier: 'QuickGas Delivery',
    supplierInitials: 'QG',
    supplierColor: '#2D7450',
    supplierAddress: '29 Herbert Macaulay Way, Yaba',
    supplierRating: 4.6,
    gasType: 'Cooking Gas',
    size: '12.5 kg',
    quantity: 1,
    unitPrice: 8500,
    total: 8500,
    deliveryFee: 0,
    deliveryAddress: '3 Broad St, Lagos Marina, Lagos Island',
    paymentMethod: 'Card — •••• 9871',
    date: 'May 10, 2026',
    time: '4:48 PM',
    status: 'delivered',
    timeline: [
      { label: 'Order placed',      time: '4:48 PM', done: true  },
      { label: 'Confirmed',         time: '4:51 PM', done: true  },
      { label: 'Out for delivery',  time: '5:30 PM', done: true  },
      { label: 'Delivered',         time: '6:02 PM', done: true  },
    ],
  },
  {
    id: '5',
    orderId: 'ORD-0005',
    supplier: 'GreenEnergy LPG',
    supplierInitials: 'GE',
    supplierColor: '#2D7450',
    supplierAddress: '7 Obafemi Awolowo Way, Ikeja',
    supplierRating: 4.4,
    gasType: 'Cooking Gas',
    size: '6 kg',
    quantity: 3,
    unitPrice: 4500,
    total: 13500,
    deliveryFee: 0,
    deliveryAddress: '14 Admiralty Way, Lekki Phase 1, Lagos',
    paymentMethod: 'Cash on delivery',
    date: 'Apr 30, 2026',
    time: '11:20 AM',
    status: 'processing',
    timeline: [
      { label: 'Order placed',      time: '11:20 AM', done: true  },
      { label: 'Confirmed',         time: '11:23 AM', done: true  },
      { label: 'Out for delivery',  time: '',         done: false },
      { label: 'Delivered',         time: '',         done: false },
    ],
  },
];
