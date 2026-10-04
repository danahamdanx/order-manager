import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/RequireRole';
import AdminLayout from './layouts/AdminLayout';
import CustomerLayout from './layouts/CustomerLayout';
import AuthPage from './pages/AuthPage';
import NotFound from './pages/NotFound';
import Placeholder from './pages/Placeholder';
import CartPage from './pages/CartPage';
import MyOrdersPage from './pages/MyOrdersPage';
import ProductPage from './pages/ProductPage';
import ShopPage from './pages/ShopPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/shop" replace />} />
      <Route path="/login" element={<AuthPage key="login" mode="login" />} />
      <Route path="/register" element={<AuthPage key="register" mode="register" />} />

            {/* واجهة الزبون: الـ Shop والسلة مفتوحين للكل */}
      <Route element={<CustomerLayout />}>
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/shop/:id" element={<ProductPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route element={<RequireRole roles={['customer']} />}>
          <Route path="/my-orders" element={<MyOrdersPage />} />
        </Route>
      </Route>

      {/* لوحة الإدارة: admin و staff بس */}
      <Route path="/admin" element={<RequireRole roles={['admin', 'staff']} />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Placeholder title="Dashboard" />} />
          <Route path="orders" element={<Placeholder title="Orders" />} />
          <Route path="customers" element={<Placeholder title="Customers" />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}