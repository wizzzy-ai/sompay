import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

const CompanyProtectedRoute = ({ children }) => {
  const { user, loading, refreshUser } = useAuth();
  const location = useLocation();
  const [isRefreshingUser, setIsRefreshingUser] = useState(false);
  const [didRefreshOnce, setDidRefreshOnce] = useState(false);

  useEffect(() => {
    // If the user just got approved by a company, the login response (or cached user)
    // might not include `companyId` yet. Do one `/auth/me` refresh before redirecting.
    if (!loading && user && !user.companyId && !didRefreshOnce) {
      setDidRefreshOnce(true);
      setIsRefreshingUser(true);
      refreshUser().catch(() => {}).finally(() => setIsRefreshingUser(false));
    }
  }, [loading, user, didRefreshOnce, refreshUser]);

  if (loading || isRefreshingUser) return <div>Loading...</div>;

  if (!user?.companyId) {
    return <Navigate to="/app/select-company" state={{ from: location }} replace />;
  }

  return children;
};

export default CompanyProtectedRoute;
