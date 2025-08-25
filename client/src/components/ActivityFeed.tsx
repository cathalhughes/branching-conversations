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

const ITEM_HEIGHT = 90;
const COMPACT_ITEM_HEIGHT = 60;

// Activity item component
const ActivityItem: React.FC<ActivityItemProps> = ({ index, style, data }) => {
  const { activities, onActivityClick, onNavigateToLocation } = data;
  const activity = activities[index];

  if (!activity) {
    return (
      <div style={style} className="px-4 py-2 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  const getActivityIcon = (type: ActivityType): string => {
    switch (type) {
      case ActivityType.CONVERSATION_CREATED:
        return '💬';
      case ActivityType.BRANCH_CREATED:
        return '🌳';
      case ActivityType.NODE_EDITED:
        return '✏️';
      case ActivityType.USER_JOINED_CANVAS:
        return '👋';
      case ActivityType.USER_LEFT_CANVAS:
        return '👋';
      case ActivityType.CONFLICT_DETECTED:
        return '⚠️';
      case ActivityType.ERROR_OCCURRED:
        return '❌';
      default:
        return '📝';
    }
  };

  const getPriorityColor = (priority: ActivityPriority = ActivityPriority.LOW): string => {
    switch (priority) {
      case ActivityPriority.CRITICAL:
        return 'border-l-red-500 bg-red-50';
      case ActivityPriority.HIGH:
        return 'border-l-orange-500 bg-orange-50';
      case ActivityPriority.MEDIUM:
        return 'border-l-blue-500 bg-blue-50';
      default:
        return 'border-l-gray-300 bg-gray-50';
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

  return (
    <div style={style} className="px-2 py-1">
      <div
        className={`
          ${getPriorityColor(activity.priority)}
          border-l-4 rounded-r-lg p-3 cursor-pointer hover:shadow-md transition-shadow
        `}
        onClick={handleClick}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3 flex-1">
            <span className="text-lg flex-shrink-0 mt-0.5">
              {getActivityIcon(activity.activityType)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {activity.description}
              </p>
              <div className="flex items-center space-x-2 mt-1">
                <span className="text-xs text-gray-500">
                  by {activity.userName}
                </span>
                <span className="text-xs text-gray-400">•</span>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(activity.timestamp)}
                </span>
                {activity.batchId && (
                  <>
                    <span className="text-xs text-gray-400">•</span>
                    <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">
                      batched
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          {(activity.conversationId || activity.nodeId) && (
            <button
              onClick={handleNavigate}
              className="flex-shrink-0 text-xs text-blue-600 hover:text-blue-800 bg-blue-100 hover:bg-blue-200 px-2 py-1 rounded transition-colors"
              title="Navigate to location"
            >
              Go
            </button>
          )}
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
  const height = isExpanded ? 400 : 200;
  const itemHeight = isExpanded ? ITEM_HEIGHT : COMPACT_ITEM_HEIGHT;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">
          Activity Feed
          {filteredActivities.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">
              ({filteredActivities.length} activities)
            </span>
          )}
        </h3>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Activity Type
              </label>
              <select
                value={filters.activityTypes?.[0] || ''}
                onChange={(e) => {
                  handleFilterChange({
                    activityTypes: e.target.value ? [e.target.value as ActivityType] : undefined,
                  });
                }}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              >
                <option value="">All types</option>
                <option value={ActivityType.CONVERSATION_CREATED}>Conversations</option>
                <option value={ActivityType.NODE_EDITED}>Edits</option>
                <option value={ActivityType.BRANCH_CREATED}>Branches</option>
                <option value={ActivityType.USER_JOINED_CANVAS}>Users</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                User
              </label>
              <input
                type="text"
                value={filters.userId || ''}
                onChange={(e) => handleFilterChange({ userId: e.target.value || undefined })}
                placeholder="Filter by user..."
                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
              />
            </div>
          </div>
          <div className="flex justify-end mt-2 space-x-2">
            <button
              onClick={clearFilters}
              className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Activity List */}
      <div style={{ height }}>
        {filteredActivities.length === 0 && !isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-2xl mb-2">📝</div>
              <p className="text-sm">No activity yet</p>
              <p className="text-xs text-gray-400">Activity will appear here as users interact with the canvas</p>
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
                height={height}
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
        <div className="flex items-center justify-center p-2 border-t border-gray-200">
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
            <span>Loading activities...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;