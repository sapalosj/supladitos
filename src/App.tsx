import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { RequireAuth } from '@/components/layout/RequireAuth'
import Login from '@/pages/Login'
import Sell from '@/pages/Sell'
import Orders from '@/pages/Orders'
import Menu from '@/pages/Menu'
import Dashboard from '@/pages/Dashboard'
import DayClose from '@/pages/DayClose'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Sell />} />
          <Route path="orders" element={<Orders />} />
          <Route path="menu" element={<Menu />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="day-close" element={<DayClose />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
