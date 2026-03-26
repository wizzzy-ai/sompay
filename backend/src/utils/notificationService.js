import Notification from '../models/Notification.js';
import User from '../models/User.js';
import NotificationSettings from '../models/NotificationSettings.js';
import { sendNotificationEmail } from './emailService.js';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const formatMonthYear = ({ month, year }) => {
  const safeMonth = Number(month);
  const safeYear = Number(year);
  const monthName = MONTH_NAMES[safeMonth - 1] || `Month ${safeMonth}`;
  return `${monthName} ${safeYear}`;
};

export const createUserNotification = async ({
  userId,
  type,
  title,
  message,
  metadata = {},
  dedupeKey = null,
}) => {
  if (!userId) return null;
  if (!type || !title || !message) return null;

  if (dedupeKey) {
    const existing = await Notification.findOne({
      user: userId,
      'metadata.dedupeKey': String(dedupeKey),
    }).select('_id');
    if (existing) return existing;
  }

  const notification = await Notification.create({
    user: userId,
    type,
    title: String(title).slice(0, 120),
    message: String(message).slice(0, 500),
    metadata: {
      ...metadata,
      ...(dedupeKey ? { dedupeKey: String(dedupeKey) } : {}),
    },
  });

  const emailEnabled = String(process.env.NOTIFICATION_EMAILS_ENABLED || '').toLowerCase() === 'true';
  if (emailEnabled) {
    try {
      const user = await User.findById(userId).select('email name');
      if (user?.email) {
        const settings = await NotificationSettings.findOne({ user: userId }).lean();
        const emailSettings = settings?.settings?.email || null;

        const wantsEmail = (() => {
          if (!emailSettings) return true;
          if (type === 'payment_status') return emailSettings.paymentReminders !== false;
          if (type === 'admin_message') return emailSettings.accountUpdates !== false;
          return emailSettings.accountUpdates !== false;
        })();

        if (wantsEmail) {
          const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';
          await sendNotificationEmail({
            to: user.email,
            title,
            message,
            link: `${frontendBase}/app/notifications`,
          });
        }
      }
    } catch {
      // never fail the main action due to email issues
    }
  }

  return notification;
};
