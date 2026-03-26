import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const DashboardRedirect = () => {
  const { user, loading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [isRefreshingUser, setIsRefreshingUser] = useState(false);
  const [didRefreshOnce, setDidRefreshOnce] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      if (!user.companyId && !didRefreshOnce && !(user.roles && (user.roles.includes('admin') || user.roles.includes('company')))) {
        setDidRefreshOnce(true);
        setIsRefreshingUser(true);
        refreshUser().catch(() => {}).finally(() => setIsRefreshingUser(false));
        return;
      }

      if (user.roles && user.roles.includes('admin')) {
        navigate('/admin/dashboard', { replace: true });
      } else if (user.roles && user.roles.includes('company')) {
        navigate('/company/dashboard', { replace: true });
      } else if (!user.companyId) {
        navigate('/app/select-company', { replace: true });
      } else {
        navigate('/app/dashboard', { replace: true });
      }
    }
  }, [user, loading, navigate, refreshUser, didRefreshOnce]);

  if (loading || isRefreshingUser) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return null;
};

export default DashboardRedirect;
