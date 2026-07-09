'use client';

import { Suspense, useEffect, useMemo, useState, FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ordersApi, Order, InitializeOrderResult } from '@/lib/api';
import { CYLINDER_SIZES, STATUS_LABEL, formatNaira } from '@/lib/format';

type StatusFilter = 'ALL' | Order['status'];

const FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED'];

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  const [supplierName, setSupplierName] = useState(() => searchParams.get('supplier') ?? '');
  const [cylinderSize, setCylinderSize] = useState(CYLINDER_SIZES[0]);
  const [quantity, setQuantity] = useState(1);
  const [totalAmount, setTotalAmount] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<InitializeOrderResult | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);

  async function loadOrders() {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const data = await ordersApi.list();
      setOrders(data);
    } catch (err) {
      setOrdersError(err instanceof Error ? err.message : 'Could not load orders.');
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const filteredOrders = useMemo(
    () => (filter === 'ALL' ? orders : orders.filter((o) => o.status === filter)),
    [orders, filter]
  );

  async function handlePlaceOrder(e: FormEvent) {
    e.preventDefault();
    setPlaceError(null);
    setVerifyMessage(null);
    setPlacingOrder(true);
    try {
      const result = await ordersApi.initialize({
        supplierName,
        cylinderSize,
        quantity,
        totalAmount: Number(totalAmount),
        deliveryAddress
      });
      setPendingPayment(result);
    } catch (err) {
      setPlaceError(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setPlacingOrder(false);
    }
  }

  async function handleVerify() {
    if (!pendingPayment) return;
    setVerifying(true);
    setVerifyMessage(null);
    try {
      await ordersApi.verify(pendingPayment.reference);
      setVerifyMessage('Payment confirmed — order updated below.');
      setPendingPayment(null);
      setSupplierName('');
      setTotalAmount('');
      setDeliveryAddress('');
      setQuantity(1);
      await loadOrders();
    } catch (err) {
      setVerifyMessage(err instanceof Error ? err.message : 'Payment not verified yet. Complete checkout, then try again.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      <section className="dashboard-grid">
        <div className="card dashboard-order-form">
          <h2>Place a refill order</h2>
          <p className="hero-card-sub">This calls your live backend and initializes a real Paystack checkout.</p>
          <form onSubmit={handlePlaceOrder} noValidate>
            <div className="field">
              <label htmlFor="supplierName">Supplier name</label>
              <input id="supplierName" required value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label htmlFor="cylinderSize">Cylinder size</label>
                <select id="cylinderSize" value={cylinderSize} onChange={(e) => setCylinderSize(e.target.value)}>
                  {CYLINDER_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="quantity">Quantity</label>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  max={10}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="totalAmount">Total amount (₦)</label>
              <input
                id="totalAmount"
                type="number"
                min={1}
                step="0.01"
                required
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="deliveryAddress">Delivery address</label>
              <input
                id="deliveryAddress"
                required
                minLength={5}
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
              />
            </div>

            {placeError && (
              <p className="form-error" role="alert" aria-live="polite">
                {placeError}
              </p>
            )}

            <button type="submit" className="btn btn-primary btn-block" disabled={placingOrder}>
              {placingOrder ? 'Starting checkout…' : 'Start checkout'}
            </button>
          </form>

          {pendingPayment && (
            <div className="payment-panel">
              <p>
                Order created for <strong>{formatNaira(pendingPayment.amount)}</strong>. Complete payment in the Paystack
                tab, then come back and confirm.
              </p>
              <div className="payment-panel-actions">
                <a className="btn btn-secondary" href={pendingPayment.authorizationUrl} target="_blank" rel="noopener noreferrer">
                  Complete payment
                </a>
                <button type="button" className="btn btn-primary" onClick={handleVerify} disabled={verifying}>
                  {verifying ? 'Checking…' : "I've paid — confirm"}
                </button>
              </div>
              {verifyMessage && (
                <p className="form-hint" aria-live="polite">
                  {verifyMessage}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card dashboard-orders">
          <div className="dashboard-card-head">
            <h2>Your orders</h2>
          </div>
          <div className="order-filter-tabs" role="tablist" aria-label="Filter orders by status">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                className={`order-filter-tab${filter === f ? ' is-active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {f === 'ALL' ? 'All' : STATUS_LABEL[f]}
              </button>
            ))}
          </div>

          {ordersLoading && <p className="hero-card-sub">Loading orders…</p>}
          {ordersError && (
            <p className="form-error" role="alert">
              {ordersError}
            </p>
          )}
          {!ordersLoading && !ordersError && filteredOrders.length === 0 && (
            <p className="hero-card-sub">No orders match this filter.</p>
          )}
          {filteredOrders.length > 0 && (
            <div className="order-table" role="table">
              <div className="order-row order-row-head" role="row">
                <span role="columnheader">Supplier</span>
                <span role="columnheader">Size × Qty</span>
                <span role="columnheader">Amount</span>
                <span role="columnheader">Status</span>
                <span role="columnheader">Placed</span>
              </div>
              {filteredOrders.map((order) => (
                <div className="order-row" role="row" key={order.id}>
                  <span role="cell">{order.supplierName ?? '—'}</span>
                  <span role="cell">
                    {order.cylinderSize} × {order.quantity}
                  </span>
                  <span role="cell">{formatNaira(order.totalAmount)}</span>
                  <span role="cell">
                    <span className={`status-pill status-${order.status.toLowerCase()}`}>{STATUS_LABEL[order.status]}</span>
                  </span>
                  <span role="cell">{new Date(order.createdAt).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
