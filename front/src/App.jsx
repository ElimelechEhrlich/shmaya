import Layout from './comps/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import Tasks from './pages/Tasks.jsx';
import AddCustomer from './pages/AddCustomer.jsx';
import { Navigate, Route, Routes } from 'react-router';
import ProtectedRoute from './comps/ProtectedRoute.jsx';
import Logs from './pages/Logs.jsx';
import CustomerDetails from './pages/CustomerDetails.jsx';
import TaskDetails from './pages/TaskDetails.jsx';
import CustomerList from './comps/CustomerList.jsx';
import CustomerCard from './comps/CustomerCard.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* כל ה-Routes כאן מוגנים על ידי ה-ProtectedRoute */}
      <Route path="/admin" element={
        <ProtectedRoute>
          <Layout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="dashboard" />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerCard />} />
        <Route path="customers/new" element={<AddCustomer />} />
        {/* <Route path="customer/:id" element={<CustomerCard />} /> */}
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskDetails />} />
        <Route path="logs" element={<Logs />} />
      </Route>
    </Routes>
  );
}


export default App;