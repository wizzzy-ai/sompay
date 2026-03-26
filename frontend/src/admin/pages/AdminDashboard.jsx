import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowUpRight,
  Camera,
  Clock3,
  RefreshCw,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../AuthContext';
import './AdminDashboard.css';

const money = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

const formatDateTime = (value) => {
  if (!value) return 'Unknown';
  return new Date(value).toLocaleString();
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuth();
  const isCompany = !!user?.roles?.includes('company');
  const actorLabel = isCompany ? 'Company' : 'Admin';
  const apiBase = isCompany ? '/company' : '/admin';
  const loginPath = isCompany ? '/company-login' : '/admin-login';
  const routeBase = isCompany ? '/company' : '/admin';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const fileInputRef = useRef(null);
  const [onlineStats, setOnlineStats] = useState(null);
  const [stats, setStats] = useState({
    totalClients: 0,
    activeClients: 0,
    monthlyPayments: 0,
    pendingRegistrations: 0,
  });
  const [activities, setActivities] = useState([]);

  const fetchOnlineStats = useCallback(async () => {
    if (isCompany) return;
    try {
      const res = await api.get('/admin/online-stats', { params: { minutes: 5 } });
      setOnlineStats(res.data || null);
    } catch (err) {
      console.error('Online stats fetch error:', err);
      setOnlineStats(null);
    }
  }, [isCompany]);

  const fetchDashboard = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        setError('');
        const [statsRes, activityRes] = await Promise.all([
          api.get(`${apiBase}/dashboard-stats`),
          api.get(`${apiBase}/recent-activities`),
        ]);

        const data = statsRes?.data || {};
        setStats({
          totalClients: Number(data.totalClients || 0),
          activeClients: Number(data.activeClients || 0),
          monthlyPayments: Number(data.monthlyPayments || 0),
          pendingRegistrations: Number(data.pendingRegistrations || 0),
        });
        setActivities(Array.isArray(activityRes?.data?.activities) ? activityRes.data.activities : []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
        if (err?.response?.status === 401) {
          navigate(loginPath);
          return;
        }
        setError('Unable to load dashboard data right now. Please refresh.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [navigate, apiBase, loginPath]
  );

	useEffect(() => {
		const token = sessionStorage.getItem('token');
		if (!token) {
			navigate(loginPath);
			return;
		}
		fetchDashboard();
		fetchOnlineStats();
	}, [fetchDashboard, fetchOnlineStats, navigate, loginPath]);

  const companyLogoUrl = isCompany ? (user?.companyLogoUrl || null) : null;
  const companyDisplayName = isCompany ? String(user?.companyName || user?.name || 'Company').toUpperCase() : '';

  const onPickLogo = () => {
    setLogoError('');
    fileInputRef.current?.click?.();
  };

  const onLogoFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLogoError('');
    if (!file.type?.startsWith('image/')) {
      setLogoError('Please select an image file.');
      return;
    }

    if (file.size > 280_000) {
      setLogoError('Image too large. Please use a smaller file (under ~280KB).');
      return;
    }

    setLogoUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      await api.put('/company/me/logo', { logoUrl: dataUrl });
      await refreshUser();
    } catch (err) {
      console.error('Logo upload error:', err);
      setLogoError(err?.response?.data?.error || 'Unable to upload logo right now.');
    } finally {
      setLogoUploading(false);
    }
  };

  useEffect(() => {
    if (isCompany) return;
    const interval = setInterval(fetchOnlineStats, 15_000);
    return () => clearInterval(interval);
  }, [fetchOnlineStats, isCompany]);

  const derived = useMemo(() => {
    const inactiveClients = Math.max(stats.totalClients - stats.activeClients, 0);
    const activationRate = stats.totalClients > 0
      ? Math.round((stats.activeClients / stats.totalClients) * 100)
      : 0;
    return { inactiveClients, activationRate };
  }, [stats]);

  if (loading) {
    return (
      <div className="admdb-page">
        <div className="container py-5 text-center">
          <div className="spinner-border admdb-spinner" role="status">
            <span className="visually-hidden">Loading dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

	  const statCards = [
    {
      key: 'total',
      title: 'Total Clients',
      value: stats.totalClients.toLocaleString(),
      note: `${derived.inactiveClients.toLocaleString()} inactive`,
      icon: <Users size={20} />,
    },
    {
      key: 'active',
      title: 'Active Clients',
      value: stats.activeClients.toLocaleString(),
      note: `${derived.activationRate}% activation rate`,
      icon: <UserCheck size={20} />,
    },
    {
      key: 'revenue',
      title: 'Monthly Revenue',
      value: money.format(stats.monthlyPayments),
      note: 'Paid transactions this month',
      icon: <Wallet size={20} />,
    },
    {
      key: 'pending',
      title: 'Pending Registrations',
      value: stats.pendingRegistrations.toLocaleString(),
      note: 'Requires review',
      icon: <UserPlus size={20} />,
    },
	  ];

  const onlineCards = !isCompany && onlineStats ? [
    {
      key: 'users-online',
      title: 'Users Online',
      value: `${onlineStats.users?.online?.toLocaleString?.() ?? 0} / ${onlineStats.users?.total?.toLocaleString?.() ?? 0}`,
      note: `Offline: ${onlineStats.users?.offline?.toLocaleString?.() ?? 0}`,
      icon: <Users size={20} />,
    },
    {
      key: 'companies-online',
      title: 'Companies Online',
      value: `${onlineStats.companies?.online?.toLocaleString?.() ?? 0} / ${onlineStats.companies?.total?.toLocaleString?.() ?? 0}`,
      note: `Offline: ${onlineStats.companies?.offline?.toLocaleString?.() ?? 0}`,
      icon: <Wallet size={20} />,
    },
  ] : [];

  return (
    <div className="admdb-page">
      <div className="container">
	        <section className="admdb-hero">
	          <div>
	            <p className="admdb-kicker">Sompay PSP</p>
	            <h1>{actorLabel} Dashboard</h1>
            <p className="admdb-subtitle">
              Monitor client growth, registrations, and payment flow in one place.
            </p>
          </div>
            <div className="admdb-hero-actions">
              {isCompany ? (
                <div className="admdb-company-card" aria-label="Company profile">
                  <div className="admdb-company-left">
                    <span className="admdb-company-avatar" aria-hidden="true">
                      {companyLogoUrl ? <img src={companyLogoUrl} alt="" /> : <span>{companyDisplayName.slice(0, 1) || 'C'}</span>}
                    </span>
                    <div className="admdb-company-meta">
                      <div className="admdb-company-name">{companyDisplayName}</div>
                      <div className="admdb-company-sub">Company profile</div>
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onLogoFile}
                    style={{ display: 'none' }}
                  />

                  <button
                    type="button"
                    className="admdb-logo-btn"
                    onClick={onPickLogo}
                    disabled={logoUploading}
                    title="Upload company logo"
                  >
                    <Camera size={16} />
                    {logoUploading ? 'Uploading...' : 'Upload Logo'}
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="admdb-refresh-btn"
                onClick={() => fetchDashboard(true)}
                disabled={refreshing}
              >
                <RefreshCw size={16} className={refreshing ? 'admdb-rotating' : ''} />
                {refreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
	        </section>

          {isCompany && logoError ? (
            <div className="alert alert-warning mt-3" role="alert">
              {logoError}
            </div>
          ) : null}

        {error ? (
          <div className="alert alert-danger mt-3" role="alert">
            {error}
          </div>
        ) : null}

        <section className="admdb-stats-grid">
          {statCards.map((card) => (
            <article key={card.key} className="admdb-stat-card">
              <div className="admdb-stat-top">
                <span className="admdb-stat-title">{card.title}</span>
                <span className="admdb-stat-icon">{card.icon}</span>
              </div>
              <div className="admdb-stat-value">{card.value}</div>
              <div className="admdb-stat-note">{card.note}</div>
            </article>
          ))}
        </section>

        {onlineCards.length ? (
          <section className="admdb-online-grid">
            {onlineCards.map((card) => (
              <article key={card.key} className="admdb-stat-card">
                <div className="admdb-stat-top">
                  <span className="admdb-stat-title">{card.title}</span>
                  <span className="admdb-stat-icon">{card.icon}</span>
                </div>
                <div className="admdb-stat-value">{card.value}</div>
                <div className="admdb-stat-note">{card.note}</div>
              </article>
            ))}
          </section>
        ) : null}

        <section className="admdb-main-grid">
          <article className="admdb-panel">
            <div className="admdb-panel-head">
              <div>
                <h2>Performance Snapshot</h2>
                <p>Key operational metrics for this company account.</p>
              </div>
            </div>

            <div className="admdb-metric-list">
              <div className="admdb-metric-item">
                <div>
                  <span className="admdb-metric-label">Activation Rate</span>
                  <strong className="admdb-metric-value">{derived.activationRate}%</strong>
                </div>
                <ArrowUpRight size={17} />
              </div>
              <div className="admdb-metric-item">
                <div>
                  <span className="admdb-metric-label">Inactive Clients</span>
                  <strong className="admdb-metric-value">{derived.inactiveClients.toLocaleString()}</strong>
                </div>
                <Users size={17} />
              </div>
              <div className="admdb-metric-item">
                <div>
                  <span className="admdb-metric-label">Pending Reviews</span>
                  <strong className="admdb-metric-value">{stats.pendingRegistrations.toLocaleString()}</strong>
                </div>
                <Clock3 size={17} />
              </div>
            </div>

            <div className="admdb-actions">
              {isCompany ? (
                <button type="button" className="admdb-action-btn" onClick={() => navigate(`${routeBase}/clients`)}>
                  Manage Clients
                </button>
              ) : (
                <button type="button" className="admdb-action-btn" onClick={() => navigate(`${routeBase}/companies`)}>
                  Manage Companies
                </button>
              )}
              <button type="button" className="admdb-action-btn" onClick={() => navigate(`${routeBase}/payments`)}>
                Open Payments
              </button>
              <button type="button" className="admdb-action-btn" onClick={() => navigate(`${routeBase}/users`)}>
                Open Users
              </button>
            </div>
          </article>

          <article className="admdb-panel">
            <div className="admdb-panel-head">
              <div>
                <h2>Recent Activity</h2>
                <p>Latest registrations and transactions.</p>
              </div>
              <Activity size={17} />
            </div>

            {activities.length === 0 ? (
              <div className="admdb-empty">
                <Clock3 size={34} />
                <p>No recent activity yet.</p>
              </div>
            ) : (
              <div className="admdb-activity-list">
                {activities.map((item) => (
                  <div
                    key={`${item.type}-${item.timestamp}-${item.message}`}
                    className="admdb-activity-row"
                  >
                    <div className="admdb-activity-main">
                      <p className="admdb-activity-message">{item.message || 'Activity update'}</p>
                      <span className={`admdb-pill ${item.type === 'transaction' ? 'is-tx' : 'is-reg'}`}>
                        {item.type === 'transaction' ? 'Transaction' : 'Registration'}
                      </span>
                    </div>
                    <time className="admdb-activity-time">{formatDateTime(item.timestamp)}</time>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
