// src/comps/ProtectedRoute.tsx
import React from 'react';
import { authService } from '../services/authService';
import { Navigate } from 'react-router';

// הגדרת הטיפוס עבור נתיב מוגן במערכת
interface ProtectedRouteProps {
    children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps): React.ReactElement | null {
    if (!authService.isAuthenticated()) {
        return <Navigate to="/" replace />;
    }
    
    // כפיית טיפוס קלה כדי להבטיח ש-TypeScript מקבל את ה-children כאלמנט ויזואלי תקין לחזרה
    return children as React.ReactElement;
}
