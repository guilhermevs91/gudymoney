// Shared types, validators and constants for Gudy Money

/**
 * Generic API response wrapper used by all endpoints.
 */
export type ApiResponse<T> = {
  data: T;
  message?: string;
};

/**
 * Paginated API response wrapper for list endpoints.
 */
export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};
