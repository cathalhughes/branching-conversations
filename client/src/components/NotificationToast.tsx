import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ActivityNotification,
  ActivityPriority,
  ActivityType,
} from '../types/activity.types';

interface Toast extends ActivityNotification {
  id: string;
  isVisible: boolean;
  isExiting: boolean;
}

interface NotificationToastProps {
  notifications: ActivityNotification[];
  onNotificationClick?: (notification: ActivityNotification) => void;
  onNotificationDismiss?: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  maxToasts?: number;
  autoHideDuration?: number; // in ms, 0 means no auto-hide
}

const ANIMATION_DURATION = 300;
const DEFAULT_AUTO_HIDE = 5000;

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onNotificationClick,
  onNotificationDismiss,
  position = 'top-right',
  maxToasts = 5,
  autoHideDuration = DEFAULT_AUTO_HIDE,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Add new notifications as toasts
  useEffect(() => {
    notifications.forEach((notification) => {
      // Check if this notification is already a toast
      const existingToast = toasts.find((t) => t.id === notification.id);
      if (existingToast) return;

      const newToast: Toast = {
        ...notification,
        isVisible: true,
        isExiting: false,
      };

      setToasts((prev) => {
        const updated = [newToast, ...prev];
        // Limit the number of toasts
        return updated.slice(0, maxToasts);
      });
    });
  }, [notifications, toasts, maxToasts]);

  // Auto-hide toasts
  useEffect(() => {
    if (autoHideDuration === 0) return;

    const timers = toasts
      .filter((toast) => toast.isVisible && !toast.isExiting)
      .map((toast) => {
        return setTimeout(() => {
          hideToast(toast.id);
        }, autoHideDuration);
      });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [toasts, autoHideDuration]);

  const hideToast = useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((toast) =>
        toast.id === id
          ? { ...toast, isExiting: true }
          : toast
      )
    );

    // Remove from DOM after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      if (onNotificationDismiss) {
        onNotificationDismiss(id);
      }
    }, ANIMATION_DURATION);
  }, [onNotificationDismiss]);

  const handleToastClick = (toast: Toast) => {
    if (onNotificationClick) {
      onNotificationClick(toast);
    }
    hideToast(toast.id);
  };

  const getToastIcon = (activityType: ActivityType): string => {
    switch (activityType) {
      case ActivityType.CONVERSATION_CREATED:
        return '💬';
      case ActivityType.BRANCH_CREATED:
        return '🌳';
      case ActivityType.USER_JOINED_CANVAS:
        return '👋';
      case ActivityType.USER_LEFT_CANVAS:
        return '👋';
      case ActivityType.CONFLICT_DETECTED:
        return '⚠️';
      case ActivityType.ERROR_OCCURRED:
        return '❌';
      case ActivityType.NODE_EDITED:
        return '✏️';
      default:
        return '📝';
    }
  };

  const getPriorityStyles = (priority: ActivityPriority): string => {
    switch (priority) {
      case ActivityPriority.CRITICAL:
        return 'bg-red-500 border-red-600 text-white';
      case ActivityPriority.HIGH:
        return 'bg-orange-500 border-orange-600 text-white';
      case ActivityPriority.MEDIUM:
        return 'bg-blue-500 border-blue-600 text-white';
      default:
        return 'bg-gray-800 border-gray-900 text-white';
    }
  };

  const getPositionClasses = (): string => {
    switch (position) {
      case 'top-left':
        return 'top-4 left-4';
      case 'top-right':
        return 'top-4 right-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
        return 'bottom-4 right-4';
      default:
        return 'top-4 right-4';
    }
  };

  if (toasts.length === 0) return null;

  const toastContainer = (
    <div
      className={`fixed ${getPositionClasses()} z-50 space-y-2 pointer-events-none`}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto transform transition-all duration-300 ease-in-out max-w-sm w-full
            ${
              toast.isVisible && !toast.isExiting
                ? 'translate-x-0 opacity-100 scale-100'
                : position.includes('right')
                ? 'translate-x-full opacity-0 scale-95'
                : '-translate-x-full opacity-0 scale-95'
            }
          `}
        >
          <div
            className={`
              ${getPriorityStyles(toast.priority)} 
              border rounded-lg shadow-lg p-4 cursor-pointer hover:shadow-xl transition-shadow
            `}
            onClick={() => handleToastClick(toast)}
          >
            <div className="flex items-start space-x-3">
              <span className="text-lg flex-shrink-0 mt-0.5">
                {getToastIcon(toast.activityType)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium truncate">
                      {toast.message}
                    </p>
                    <p className="text-xs opacity-90 mt-1">
                      by {toast.userName}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      hideToast(toast.id);
                    }}
                    className="flex-shrink-0 ml-2 text-white hover:text-gray-200 transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
                {toast.action && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toast.action!.onClick();
                      hideToast(toast.id);
                    }}
                    className="mt-2 text-xs underline hover:no-underline opacity-90 hover:opacity-100 transition-opacity"
                  >
                    {toast.action.label}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  // Use portal to render toasts at the document body level
  return createPortal(toastContainer, document.body);
};

// Hook for managing toast notifications
export const useNotificationToast = () => {
  const [notifications, setNotifications] = useState<ActivityNotification[]>([]);

  const showToast = useCallback((notification: Omit<ActivityNotification, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newNotification: ActivityNotification = {
      ...notification,
      id,
    };
    
    setNotifications((prev) => [newNotification, ...prev]);
    
    return id;
  }, []);

  const hideToast = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setNotifications([]);
  }, []);

  return {
    notifications,
    showToast,
    hideToast,
    clearAllToasts,
  };
};

export default NotificationToast;