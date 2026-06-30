// src/App.tsx
import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import Layout from './comps/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import Tasks from './pages/Tasks';
import AddCustomer from './pages/AddCustomer';
import ProtectedRoute from './comps/ProtectedRoute';
import Logs from './pages/Logs';
import TaskDetails from './pages/TaskDetails';
import CustomerCard from './comps/CustomerCard';
import { ModalProvider } from './contexts/ModalContext';






function App(): React.ReactElement {
  const location = useLocation();
  return (
  <ModalProvider>
    <Routes>
      <Route path="/" element={<Login />} />

      <Route 
        path="/admin" 
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/new" element={<AddCustomer key={location.search} />} />
        <Route path="customers/:id" element={<CustomerCard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskDetails />} />
        <Route path="logs" element={<Logs />} />
      </Route>
    </Routes>
    </ModalProvider>
  );
}

export default App;
