import type { Order } from '../types';
import { StatusBadge } from './StatusBadge';

interface Props {
  orders: Order[];
  onEdit: (order: Order) => void;
}

export function OrderTable({ orders, onEdit }: Props) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Customer</th>
            <th>Product</th>
            <th>Total</th>
            <th>Status</th>
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>#{o.id}</td>
              <td>{o.customerName}</td>
              <td>{o.product}</td>
              <td>${o.total.toFixed(2)}</td>
              <td><StatusBadge status={o.status} /></td>
              <td>{new Date(o.createdAt).toLocaleDateString()}</td>
              <td>
                <button className="btn-link" onClick={() => onEdit(o)} aria-label={`Edit order ${o.id}`}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}