import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole';
import AdminLayout from './layouts/AdminLayout';
import CustomerLayout from './layouts/CustomerLayout';
import AuthPage from './pages/AuthPage';
import CartPage from './pages/CartPage';
import MyOrdersPage from './pages/MyOrdersPage';
import NotFound from './pages/NotFound';
import ProductPage from './pages/ProductPage';
import ShopPage from './pages/ShopPage';
import CustomerDetailPage from './pages/admin/CustomerDetailPage';
import CustomersPage from './pages/admin/CustomersPage';
import DashboardPage from './pages/admin/DashboardPage';
import OrdersPage from './pages/admin/OrdersPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/shop" replace />} />
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/register" element={<AuthPage key="register" mode="register" />} />

      <Route element={<CustomerLayout />}>
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/shop/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route element={<RequireRole roles={['customer']} />}>
          <Route path="/my-orders" element={<MyOrdersPage />} />
        </Route>
      </Route>

      <Route path="/admin" element={<RequireRole roles={['admin', 'staff']} />}>
        <Route element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}