import React from 'react'
import { authService } from '../services/authService';
import { Navigate } from 'react-router';

export default function ProtectedRoute({ children }) {
if (!authService.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return children;
}
