import { useCallback, useEffect, useState } from 'react';
import api from '../api/axios';

export default function useNotificationCount({ enabled = true, pollMs = 15000 } = {}) {
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!enabled) return;
    const token = sessionStorage.getItem('token');
    if (!token) {
      setCount(0);
      return;
    }

    try {
      let r;
      try {
        r = await api.get('/notifications/unread-count');
      } catch (e) {
        if (e?.response?.status === 404) {
          r = await api.get('/api/notifications/unread-count');
        } else {
          throw e;
        }
      }
      const next = Number(r?.data?.count ?? r?.data?.unreadCount ?? 0);
      setCount(Number.isFinite(next) ? next : 0);
    } catch {
      // keep last known count on transient errors
    }
  }, [enabled]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(fetchCount, pollMs);
    return () => clearInterval(t);
  }, [enabled, fetchCount, pollMs]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUpdate = () => fetchCount();
    window.addEventListener('psp_notifications_updated', onUpdate);
    window.addEventListener('userLoggedIn', onUpdate);
    window.addEventListener('userLoggedOut', onUpdate);
    return () => {
      window.removeEventListener('psp_notifications_updated', onUpdate);
      window.removeEventListener('userLoggedIn', onUpdate);
      window.removeEventListener('userLoggedOut', onUpdate);
    };
  }, [enabled, fetchCount]);

  return { count, refresh: fetchCount };
}

