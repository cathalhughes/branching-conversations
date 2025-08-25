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
  onCanvasRefresh?: () => void;
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  canvasId,
  userId,
  userName,
  userEmail,
  isExpanded = false,
  onToggleExpanded,
  onNavigateToLocation,
  onCanvasRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'feed' | 'summary'>('feed');
  const [toastNotifications, setToastNotifications] = useState<ActivityNotification[]>([]);

  const {
    isConnected,
    activities,
    isLoading,
    error,
    // notifications,  // Unused for now
    unreadCount,
    summary,
    fetchActivities,
    fetchSummary,
    markNotificationRead,
    markAllNotificationsRead,
    onActivityUpdate,
    onNotification,
    onCanvasChange,
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
      // Refresh canvas when other users make changes
      if (activity.userId !== userId && onCanvasRefresh) {
        onCanvasRefresh();
      }
    });
  }, [onActivityUpdate, userId, onCanvasRefresh]);

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

  // Handle canvas changes
  useEffect(() => {
    onCanvasChange((event: any) => {
      console.log('Canvas change received:', event);
      // Refresh canvas for any canvas change
      if (onCanvasRefresh) {
        onCanvasRefresh();
      }
    });
  }, [onCanvasChange, onCanvasRefresh]);

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
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Canvas Selected</h3>
          <p className="text-sm text-gray-500">Select a canvas to view real-time activity and collaboration</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900">Activity Hub</h2>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 bg-white rounded-full px-3 py-1 shadow-sm border border-gray-200">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
                }`}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
              <span className={`text-xs font-medium ${
                isConnected ? 'text-green-700' : 'text-red-700'
              }`}>
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            {unreadCount > 0 && (
              <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white text-xs font-bold rounded-full px-2.5 py-1 shadow-lg animate-bounce">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsRead}
              className="flex items-center space-x-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Mark all read</span>
            </button>
          )}
          {onToggleExpanded && (
            <button
              onClick={onToggleExpanded}
              className="bg-gray-100 hover:bg-gray-200 p-2 rounded-lg transition-colors duration-200"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg
                className={`w-5 h-5 text-gray-600 transform transition-transform duration-200 ${
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
      <div className="border-b border-gray-200 bg-gray-50">
        <nav className="flex space-x-1 px-4">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold rounded-t-lg transition-all duration-200 ${
              activeTab === 'feed'
                ? 'bg-white text-blue-600 border-b-2 border-blue-500 shadow-sm'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14-7H3a2 2 0 00-2 2v16l4-4h12a2 2 0 002-2V6a2 2 0 00-2-2z" />
            </svg>
            <span>Live Feed</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('summary');
              refreshSummary();
            }}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold rounded-t-lg transition-all duration-200 ${
              activeTab === 'summary'
                ? 'bg-white text-blue-600 border-b-2 border-blue-500 shadow-sm'
                : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Summary</span>
          </button>
        </nav>
      </div>

      {/* Error Display */}
      {error && (
        <div className="m-4 p-4 bg-gradient-to-r from-red-50 to-red-100 border border-red-200 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-800 mb-1">Connection Error</h4>
              <p className="text-sm text-red-700">{error}</p>
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
      <div className="p-6 space-y-6">
        <div className="animate-pulse">
          <div className="flex items-center space-x-4 mb-6">
            <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
            <div className="space-y-2">
              <div className="h-5 bg-gray-200 rounded w-32"></div>
              <div className="h-4 bg-gray-200 rounded w-24"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="h-20 bg-gray-200 rounded-lg"></div>
            <div className="h-20 bg-gray-200 rounded-lg"></div>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            <div className="h-4 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Summary Available</h3>
        <p className="text-sm text-gray-500 mb-4">Generate an activity summary to see insights and trends</p>
        <button
          onClick={onRefresh}
          className="bg-blue-500 hover:bg-blue-600 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200"
        >
          Generate Summary
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Activity Summary</h3>
            <p className="text-sm text-gray-500">{summary.timeRange}</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-2 rounded-lg transition-colors duration-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Total Activities */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-xl p-6 hover:shadow-lg transition-shadow duration-200">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-3xl font-bold text-blue-900">
                {summary.totalActivities}
              </div>
              <div className="text-sm font-medium text-blue-700">Total Activities</div>
            </div>
          </div>
        </div>

        {/* Activity Breakdown */}
        {summary.activityBreakdown.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow duration-200">
            <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              </svg>
              <span>Activity Breakdown</span>
            </h4>
            <div className="space-y-3">
              {summary.activityBreakdown.slice(0, 5).map((item, index) => {
                const percentage = (item.count / summary.totalActivities) * 100;
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500'];
                const bgColors = ['bg-blue-100', 'bg-green-100', 'bg-purple-100', 'bg-orange-100', 'bg-pink-100'];
                return (
                  <div key={item._id} className={`${bgColors[index % bgColors.length]} rounded-lg p-3`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-800 capitalize">
                        {item._id.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-gray-900">
                          {item.count}
                        </span>
                        <span className="text-xs text-gray-600">({percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-white bg-opacity-50 rounded-full h-2">
                      <div
                        className={`${colors[index % colors.length]} h-2 rounded-full transition-all duration-300`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Most Active Users */}
        {summary.mostActiveUsers.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-shadow duration-200">
            <h4 className="text-base font-bold text-gray-900 mb-4 flex items-center space-x-2">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
              <span>Top Contributors</span>
            </h4>
            <div className="space-y-3">
              {summary.mostActiveUsers.slice(0, 5).map((user, index) => {
                const rankColors = ['bg-yellow-500', 'bg-gray-400', 'bg-orange-600', 'bg-blue-500', 'bg-purple-500'];
                const maxCount = summary.mostActiveUsers[0]?.activityCount || 1;
                const percentage = (user.activityCount / maxCount) * 100;
                return (
                  <div key={user._id} className="flex items-center space-x-4 bg-gray-50 rounded-lg p-3">
                    <div className={`w-8 h-8 ${rankColors[index]} rounded-full flex items-center justify-center text-white font-bold text-sm`}>
                      #{index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-gray-800">{user.userName}</span>
                        <span className="text-sm font-bold text-gray-900">
                          {user.activityCount} activities
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`${rankColors[index]} h-2 rounded-full transition-all duration-300`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPanel;