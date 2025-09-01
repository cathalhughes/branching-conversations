import React, { useState, useCallback, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import InfiniteLoader from 'react-window-infinite-loader';
import {
  Activity,
  ActivityType,
  ActivityPriority,
  ActivityFilter,
} from '../types/activity.types';
import { formatDistanceToNow } from '../utils/dateUtils';

interface ActivityFeedProps {
  activities: Activity[];
  isLoading: boolean;
  hasNextPage: boolean;
  isExpanded?: boolean;
  canvasId: string;
  userId?: string;
  onLoadMore: (filter: ActivityFilter) => Promise<void>;
  onActivityClick?: (activity: Activity) => void;
  onNavigateToLocation?: (activity: Activity) => void;
}

interface ActivityItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    activities: Activity[];
    onActivityClick?: (activity: Activity) => void;
    onNavigateToLocation?: (activity: Activity) => void;
  };
}

const ITEM_HEIGHT = 80;
const COMPACT_ITEM_HEIGHT = 70;

// Activity item component
const ActivityItem: React.FC<ActivityItemProps> = ({ index, style, data }) => {
  const { activities, onActivityClick, onNavigateToLocation } = data;
  const activity = activities[index];

  if (!activity) {
    return (
      <div style={style} className="px-4 py-3">
        <div className="border border-white border-opacity-10 rounded-xl p-5 animate-pulse bg-white bg-opacity-5 backdrop-blur-sm">
          <div className="flex items-start space-x-4">
            <div className="w-10 h-10 bg-white bg-opacity-20 rounded-xl"></div>
            <div className="flex-1 space-y-3">
              <div className="h-4 bg-white bg-opacity-20 rounded w-3/4"></div>
              <div className="flex space-x-2">
                <div className="h-3 bg-white bg-opacity-20 rounded w-20"></div>
                <div className="h-3 bg-white bg-opacity-20 rounded w-16"></div>
                <div className="h-3 bg-white bg-opacity-20 rounded w-12"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getActivityIcon = (type: ActivityType): { icon: React.ReactElement; color: string; bgColor: string } => {
    switch (type) {
      case ActivityType.CONVERSATION_CREATED:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
          color: 'text-blue-600',
          bgColor: 'bg-blue-500'
        };
      case ActivityType.BRANCH_CREATED:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-500'
        };
      case ActivityType.NODE_EDITED:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
          color: 'text-orange-600',
          bgColor: 'bg-orange-500'
        };
      case ActivityType.USER_JOINED_CANVAS:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>,
          color: 'text-purple-600',
          bgColor: 'bg-purple-500'
        };
      case ActivityType.USER_LEFT_CANVAS:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>,
          color: 'text-gray-600',
          bgColor: 'bg-gray-500'
        };
      case ActivityType.CONFLICT_DETECTED:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
          color: 'text-red-600',
          bgColor: 'bg-red-500'
        };
      case ActivityType.ERROR_OCCURRED:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
          color: 'text-red-600',
          bgColor: 'bg-red-500'
        };
      default:
        return {
          icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
          color: 'text-slate-600',
          bgColor: 'bg-slate-500'
        };
    }
  };

  const getPriorityStyles = (priority: ActivityPriority = ActivityPriority.LOW): { border: string; bg: string } => {
    switch (priority) {
      case ActivityPriority.CRITICAL:
        return {
          border: 'border-red-400',
          bg: 'bg-red-500 bg-opacity-10 hover:bg-opacity-20'
        };
      case ActivityPriority.HIGH:
        return {
          border: 'border-orange-400',
          bg: 'bg-orange-500 bg-opacity-10 hover:bg-opacity-20'
        };
      case ActivityPriority.MEDIUM:
        return {
          border: 'border-blue-400',
          bg: 'bg-blue-500 bg-opacity-10 hover:bg-opacity-20'
        };
      default:
        return {
          border: 'border-white border-opacity-20',
          bg: 'bg-white bg-opacity-5 hover:bg-opacity-15'
        };
    }
  };

  const handleClick = () => {
    if (onActivityClick) {
      onActivityClick(activity);
    }
  };

  const handleNavigate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onNavigateToLocation) {
      onNavigateToLocation(activity);
    }
  };

  const iconData = getActivityIcon(activity.activityType);
  const priorityStyles = getPriorityStyles(activity.priority);

  return (
    <div style={style} className="px-3 py-2">
      <div
        className="bg-white bg-opacity-5 backdrop-blur-sm hover:bg-opacity-10 cursor-pointer transition-all duration-200 group border border-white border-opacity-10 rounded-2xl p-4"
        onClick={handleClick}
      >
        <div className="flex items-center space-x-4">
          {/* Icon */}
          <div className={`${iconData.bgColor} p-3 bg-opacity-20 group-hover:bg-opacity-30 transition-colors duration-200 flex-shrink-0 rounded-xl shadow-lg`}>
            <div className="text-white">
              {iconData.icon}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Description */}
            <h4 className="text-sm font-medium text-white leading-relaxed mb-2">
              {activity.description}
            </h4>

            {/* Metadata */}
            <div className="flex items-center space-x-4 text-xs text-white text-opacity-60">
              <span className="font-medium text-white text-opacity-80">
                {activity.userName}
              </span>
              <span>
                {formatDistanceToNow(activity.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ActivityFeed: React.FC<ActivityFeedProps> = ({
  activities,
  isLoading,
  hasNextPage,
  isExpanded = false,
  canvasId,
  userId,
  onLoadMore,
  onActivityClick,
  onNavigateToLocation,
}) => {
  const [filters, setFilters] = useState<ActivityFilter>({});
  const [showFilters, setShowFilters] = useState(false);
  const [listHeight, setListHeight] = useState(400);
  const listContainerRef = React.useRef<HTMLDivElement>(null);

  // Filter out current user's join notifications
  const filteredActivities = useMemo(() => {
    return activities.filter(activity => {
      // Don't show current user's own join notifications
      if (userId && activity.userId === userId && activity.activityType === ActivityType.USER_JOINED_CANVAS) {
        return false;
      }
      return true;
    });
  }, [activities, userId]);

  // Memoized item data for react-window
  const itemData = useMemo(
    () => ({
      activities: filteredActivities,
      onActivityClick,
      onNavigateToLocation,
    }),
    [filteredActivities, onActivityClick, onNavigateToLocation]
  );

  // Check if an item is loaded
  const isItemLoaded = useCallback(
    (index: number) => !!activities[index],
    [activities]
  );

  // Load more items
  const loadMoreItems = useCallback(
    async (startIndex: number, stopIndex: number) => {
      if (isLoading) return;
      
      await onLoadMore({
        ...filters,
        offset: startIndex,
        limit: stopIndex - startIndex + 1,
      });
    },
    [isLoading, onLoadMore, filters]
  );

  const handleFilterChange = (newFilters: Partial<ActivityFilter>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onLoadMore({ ...updatedFilters, offset: 0 });
  };

  const clearFilters = () => {
    setFilters({});
    onLoadMore({ offset: 0 });
  };

  const itemCount = hasNextPage ? filteredActivities.length + 1 : filteredActivities.length;
  const itemHeight = ITEM_HEIGHT;

  // Calculate actual height for React Window
  React.useEffect(() => {
    let rafId: number;
    let timeoutId: NodeJS.Timeout;

    const updateHeight = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      
      rafId = requestAnimationFrame(() => {
        if (listContainerRef.current) {
          const height = listContainerRef.current.clientHeight;
          if (height > 0 && height !== listHeight) {
            setListHeight(height);
          }
        }
      });
    };

    const debouncedUpdateHeight = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(updateHeight, 100);
    };

    // Initial height calculation
    updateHeight();
    window.addEventListener('resize', debouncedUpdateHeight);
    
    return () => {
      window.removeEventListener('resize', debouncedUpdateHeight);
      if (rafId) cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [showFilters, listHeight]);

  return (
    <div className="h-full bg-transparent overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-700 to-purple-700 border-b border-white border-opacity-10 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-lg shadow-green-400/50"></div>
          <h3 className="text-base font-bold text-white">
            Activity Feed
          </h3>
          {filteredActivities.length > 0 && (
            <span className="bg-white bg-opacity-10 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm border border-white border-opacity-20">
              {filteredActivities.length} activities
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 text-xs font-medium px-3 py-2 rounded-lg transition-all duration-200 ${
              showFilters 
                ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg' 
                : 'text-white text-opacity-70 hover:text-white bg-white bg-opacity-10 hover:bg-opacity-20 backdrop-blur-sm border border-white border-opacity-20'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z" />
            </svg>
            <span>Filter</span>
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 border-b border-white border-opacity-10 bg-gradient-to-b from-slate-600 to-purple-600 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Activity Type
              </label>
              <select
                value={filters.activityTypes?.[0] || ''}
                onChange={(e) => {
                  handleFilterChange({
                    activityTypes: e.target.value ? [e.target.value as ActivityType] : undefined,
                  });
                }}
                className="w-full text-sm border border-white border-opacity-20 rounded-lg px-3 py-2 bg-white bg-opacity-10 backdrop-blur-sm text-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
              >
                <option value="">All types</option>
                <option value={ActivityType.CONVERSATION_CREATED}>💬 Conversations</option>
                <option value={ActivityType.NODE_EDITED}>✏️ Edits</option>
                <option value={ActivityType.BRANCH_CREATED}>🌿 Branches</option>
                <option value={ActivityType.USER_JOINED_CANVAS}>👋 Users</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                User
              </label>
              <input
                type="text"
                value={filters.userId || ''}
                onChange={(e) => handleFilterChange({ userId: e.target.value || undefined })}
                placeholder="Filter by user..."
                className="w-full text-sm border border-white border-opacity-20 rounded-lg px-3 py-2 bg-white bg-opacity-10 backdrop-blur-sm text-white placeholder-white placeholder-opacity-50 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
              />
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={clearFilters}
              className="flex items-center space-x-2 text-sm font-medium text-white bg-white bg-opacity-10 hover:bg-opacity-20 backdrop-blur-sm px-4 py-2 rounded-lg border border-white border-opacity-20 hover:border-opacity-40 transition-all duration-200 hover:scale-105"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Clear filters</span>
            </button>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div ref={listContainerRef} className="flex-1 bg-gradient-to-b from-slate-800 to-purple-800">
        {filteredActivities.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full text-white">
            <div className="text-center p-8">
              <div className="w-16 h-16 bg-white bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-white text-opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h4 className="text-sm font-semibold text-white mb-2">No activity yet</h4>
              <p className="text-xs text-white text-opacity-70 max-w-xs">Activity will appear here as users interact with the canvas. Start a conversation or make some edits!</p>
            </div>
          </div>
        ) : (
          <InfiniteLoader
            isItemLoaded={isItemLoaded}
            itemCount={itemCount}
            loadMoreItems={loadMoreItems}
          >
            {({ onItemsRendered, ref }: {onItemsRendered: any, ref: any}) => (
              <List
                ref={ref as any}
                width="100%"
                height={listHeight}
                itemCount={itemCount}
                itemSize={itemHeight}
                itemData={itemData}
                onItemsRendered={onItemsRendered as any}
                className="activity-list"
              >
                {ActivityItem}
              </List>
            )}
          </InfiniteLoader>
        )}
      </div>

      {/* Footer */}
      {isLoading && (
        <div className="flex items-center justify-center p-4 border-t border-white border-opacity-10 bg-gradient-to-r from-slate-700 to-purple-700 flex-shrink-0">
          <div className="flex items-center space-x-3 text-sm text-white">
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-opacity-30 border-t-blue-400"></div>
            <span className="font-medium">Loading activities...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;