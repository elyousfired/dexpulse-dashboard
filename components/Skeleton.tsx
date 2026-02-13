
import React from 'react';

export const TableSkeleton: React.FC = () => {
  return (
    <div className="w-full animate-pulse">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center space-x-4 py-4 px-6 border-b border-gray-800">
          <div className="h-10 w-10 bg-gray-800 rounded-full"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-800 rounded w-1/4"></div>
            <div className="h-3 bg-gray-800 rounded w-1/6"></div>
          </div>
          <div className="h-4 bg-gray-800 rounded w-20"></div>
          <div className="h-4 bg-gray-800 rounded w-24"></div>
          <div className="h-4 bg-gray-800 rounded w-24"></div>
        </div>
      ))}
    </div>
  );
};
