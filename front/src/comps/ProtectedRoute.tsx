import React from 'react';
import { authService } from '../services/authService';
import { Navigate, useLocation } from 'react-router';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps): React.ReactElement | null {
    const location = useLocation();
    if (!authService.isAuthenticated()) {
        const redirect = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/?redirect=${redirect}`} replace />;
    }
    return children as React.ReactElement;
}
