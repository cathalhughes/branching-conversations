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
    <div className="h-full bg-white bg-opacity-10 backdrop-blur-lg border border-white border-opacity-20 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-slate-800 via-purple-800 to-slate-800 border-b border-white border-opacity-10">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Activity Hub</h2>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 bg-white bg-opacity-10 backdrop-blur-sm rounded-full px-3 py-1 border border-white border-opacity-20">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isConnected ? 'bg-green-400 animate-pulse shadow-lg shadow-green-400/50' : 'bg-red-400 shadow-lg shadow-red-400/50'
                }`}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
              <span className={`text-xs font-medium ${
                isConnected ? 'text-green-200' : 'text-red-200'
              }`}>
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>
            {unreadCount > 0 && (
              <div className="bg-gradient-to-r from-red-400 to-pink-400 text-white text-xs font-bold rounded-full px-2.5 py-1 shadow-lg shadow-red-400/30 animate-pulse">
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllNotificationsRead}
              className="flex items-center space-x-2 text-sm font-medium text-white bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-3 py-2 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Mark all read</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white border-opacity-10 bg-gradient-to-r from-slate-700 to-purple-700">
        <nav className="flex space-x-1 px-4">
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold rounded-t-xl transition-all duration-300 ${
              activeTab === 'feed'
                ? 'bg-white bg-opacity-10 text-white border-b-2 border-blue-400 shadow-lg backdrop-blur-sm transform -translate-y-0.5'
                : 'text-white text-opacity-70 hover:text-white hover:bg-white hover:bg-opacity-5'
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
            className={`flex items-center space-x-2 py-3 px-4 text-sm font-semibold rounded-t-xl transition-all duration-300 ${
              activeTab === 'summary'
                ? 'bg-white bg-opacity-10 text-white border-b-2 border-purple-400 shadow-lg backdrop-blur-sm transform -translate-y-0.5'
                : 'text-white text-opacity-70 hover:text-white hover:bg-white hover:bg-opacity-5'
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
        <div className="m-4 p-4 bg-gradient-to-r from-red-500 to-pink-500 bg-opacity-10 backdrop-blur-sm border border-red-400 border-opacity-30 rounded-xl">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-white mb-1">Connection Error</h4>
              <p className="text-sm text-white text-opacity-80">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
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
  return (
    <div className="h-full bg-transparent overflow-hidden flex flex-col">
      {/* Header - Fixed */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-700 to-purple-700 border-b border-white border-opacity-10 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse shadow-lg shadow-purple-400/50"></div>
          <h3 className="text-base font-bold text-white">Activity Summary</h3>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center space-x-2 text-xs font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 backdrop-blur-sm px-3 py-2 rounded-lg border border-white border-opacity-20 hover:border-opacity-40 transition-all duration-200 hover:scale-105"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 bg-gradient-to-b from-slate-800 to-purple-800 overflow-y-auto">
        {isLoading ? (
          <div className="p-4">
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-white bg-opacity-10 rounded-lg"></div>
              <div className="h-20 bg-white bg-opacity-10 rounded-lg"></div>
              <div className="h-20 bg-white bg-opacity-10 rounded-lg"></div>
            </div>
          </div>
        ) : !summary ? (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center p-8">
              <div className="w-16 h-16 bg-white bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white text-opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-white mb-2">No Summary Available</h4>
              <p className="text-xs text-white text-opacity-70">Generate an activity summary to see insights</p>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            {/* Total Activities Card */}
            <div className="bg-white bg-opacity-5 backdrop-blur-sm hover:bg-opacity-10 border border-white border-opacity-10 rounded-2xl p-4">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-blue-400 bg-opacity-20 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{summary.totalActivities}</div>
                  <div className="text-sm text-white text-opacity-70">Total Activities</div>
                  <div className="text-xs text-white text-opacity-50">{summary.timeRange}</div>
                </div>
              </div>
            </div>

            {/* Activity Breakdown */}
            {summary.activityBreakdown.length > 0 && (
              <div className="bg-white bg-opacity-5 backdrop-blur-sm hover:bg-opacity-10 border border-white border-opacity-10 rounded-2xl p-4">
                <h4 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  </svg>
                  <span>Activity Breakdown</span>
                </h4>
                <div className="space-y-2">
                  {summary.activityBreakdown.slice(0, 5).map((item, index) => {
                    const percentage = (item.count / summary.totalActivities) * 100;
                    const colors = ['bg-blue-400', 'bg-green-400', 'bg-purple-400', 'bg-orange-400', 'bg-pink-400'];
                    return (
                      <div key={item._id} className="flex items-center justify-between py-2">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 ${colors[index % colors.length]} rounded-full`}></div>
                          <span className="text-sm text-white capitalize">{item._id.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="text-sm text-white font-medium">{item.count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Most Active Users */}
            {summary.mostActiveUsers.length > 0 && (
              <div className="bg-white bg-opacity-5 backdrop-blur-sm hover:bg-opacity-10 border border-white border-opacity-10 rounded-2xl p-4">
                <h4 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                  </svg>
                  <span>Top Contributors</span>
                </h4>
                <div className="space-y-2">
                  {summary.mostActiveUsers.slice(0, 5).map((user, index) => (
                    <div key={user._id} className="flex items-center justify-between py-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-6 h-6 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                          {index + 1}
                        </div>
                        <span className="text-sm text-white">{user.userName}</span>
                      </div>
                      <div className="text-sm text-white font-medium">{user.activityCount}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityPanel;