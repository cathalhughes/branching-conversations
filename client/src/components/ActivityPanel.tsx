import React, { useState, useCallback, useEffect } from 'react';
import { ActivityFeed } from './ActivityFeed';
import { NotificationToast } from './NotificationToast';
import { useActivityService } from '../hooks/useActivityService';
import {
  Activity,
  ActivityFilter,
  ActivityNotification,
  ActivitySummary,
} from '../types/activity.types';

interface ActivityPanelProps {
  canvasId: string;
  userId: string;
  userName: string;
  userEmail: string;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  onNavigateToLocation?: (activity: Activity) => void;
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  canvasId,
  userId,
  userName,
  userEmail,
  isExpanded = false,
  onToggleExpanded,
  onNavigateToLocation,
}) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'summary'>('feed');
  const [toastNotifications, setToastNotifications] = useState<ActivityNotification[]>([]);

  const {
    isConnected,
    activities,
    isLoading,
    error,
    notifications,
    unreadCount,
    summary,
    fetchActivities,
    fetchSummary,
    markNotificationRead,
    markAllNotificationsRead,
    onActivityUpdate,
    onNotification,
  } = useActivityService({
    canvasId,
    userId,
    userName,
    userEmail,
  });

  // Handle new activity updates
  useEffect(() => {
    onActivityUpdate((activity: Activity) => {
      console.log('New activity received:', activity);
    });
  }, [onActivityUpdate]);

  // Handle new notifications and show as toasts
  useEffect(() => {
    onNotification((notification: ActivityNotification) => {
      setToastNotifications(prev => [notification, ...prev]);
      
      // Auto-remove from toast list after showing
      setTimeout(() => {
        setToastNotifications(prev => prev.filter(n => n.id !== notification.id));
      }, 6000);
    });
  }, [onNotification]);

  const handleLoadMore = useCallback(
    async (filter: ActivityFilter) => {
      await fetchActivities(filter);
    },
    [fetchActivities]
  );

  const handleActivityClick = useCallback((activity: Activity) => {
    console.log('Activity clicked:', activity);
    // Could open a details modal or navigate to the activity
  }, []);

  const handleNotificationClick = useCallback((notification: ActivityNotification) => {
    markNotificationRead(notification.id);
    console.log('Notification clicked:', notification);
  }, [markNotificationRead]);

  const handleNotificationDismiss = useCallback((id: string) => {
    setToastNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const refreshSummary = useCallback(() => {
    fetchSummary(24);
  }, [fetchSummary]);

  if (!canvasId) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
        <div className="text-center text-gray-500">
          <p className="text-sm">No canvas selected</p>
          <p className="text-xs text-gray-400">Select a canvas to view activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <h2 className="text-sm font-semibold text-gray-900">Activity</h2>
          <div className="flex items-center space-x-1">
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
              title={isConnected ? 'Connected' : 'Disconnected'}
            />
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5 min-w-[1.25rem] h-5 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsRead}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
            >
              Mark all read
            </button>
          )}
          {onToggleExpanded && (
            <button
              onClick={onToggleExpanded}
              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100 transition-colors"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg
                className={`w-4 h-4 transform transition-transform ${
                  isExpanded ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-3">
          <button
            onClick={() => setActiveTab('feed')}
            className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'feed'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Feed
          </button>
          <button
            onClick={() => {
              setActiveTab('summary');
              refreshSummary();
            }}
            className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'summary'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Summary
          </button>
        </nav>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border-l-4 border-red-500">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-4 w-4 text-red-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-xs text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-0">
        {activeTab === 'feed' && (
          <ActivityFeed
            activities={activities}
            isLoading={isLoading}
            hasNextPage={true} // This should be computed based on your pagination logic
            isExpanded={isExpanded}
            canvasId={canvasId}
            userId={userId}
            onLoadMore={handleLoadMore}
            onActivityClick={handleActivityClick}
            onNavigateToLocation={onNavigateToLocation}
          />
        )}

        {activeTab === 'summary' && (
          <ActivitySummaryView
            summary={summary}
            isLoading={isLoading}
            onRefresh={refreshSummary}
          />
        )}
      </div>

      {/* Toast Notifications */}
      <NotificationToast
        notifications={toastNotifications}
        onNotificationClick={handleNotificationClick}
        onNotificationDismiss={handleNotificationDismiss}
        position="top-right"
        maxToasts={3}
        autoHideDuration={5000}
      />
    </div>
  );
};

// Summary View Component
interface ActivitySummaryViewProps {
  summary: ActivitySummary | null;
  isLoading: boolean;
  onRefresh: () => void;
}

const ActivitySummaryView: React.FC<ActivitySummaryViewProps> = ({
  summary,
  isLoading,
  onRefresh,
}) => {
  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-4 text-center text-gray-500">
        <p className="text-sm">No summary available</p>
        <button
          onClick={onRefresh}
          className="text-xs text-blue-600 hover:text-blue-800 mt-2"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Activity Summary ({summary.timeRange})
        </h3>
        <button
          onClick={onRefresh}
          className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50 transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Total Activities */}
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="text-2xl font-bold text-blue-900">
            {summary.totalActivities}
          </div>
          <div className="text-sm text-blue-700">Total Activities</div>
        </div>

        {/* Activity Breakdown */}
        {summary.activityBreakdown.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-700 mb-2">
              Activity Types
            </h4>
            <div className="space-y-2">
              {summary.activityBreakdown.slice(0, 5).map((item, index) => (
                <div
                  key={item._id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-600 capitalize">
                    {item._id.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-900 font-medium">
                      {item.count}
                    </span>
                    <div
                      className="h-2 bg-blue-500 rounded"
                      style={{
                        width: `${(item.count / summary.totalActivities) * 50}px`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Most Active Users */}
        {summary.mostActiveUsers.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-gray-700 mb-2">
              Most Active Users
            </h4>
            <div className="space-y-2">
              {summary.mostActiveUsers.slice(0, 5).map((user, index) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-gray-600">{user.userName}</span>
                  <span className="text-gray-900 font-medium">
                    {user.activityCount} activities
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPanel;