import { useQuery } from "@tanstack/react-query";
import * as api from "./api-client";

/**
 * Shared query hooks. Per doc 06 §2: all server data lives in TanStack
 * Query's cache — never in Zustand or component state.
 */

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.me,
    staleTime: 30_000,
    retry: false,
  });
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: api.listWorkspaces,
  });
}

export function useBoards(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["boards", workspaceId],
    queryFn: () => api.listBoards(workspaceId!),
    enabled: !!workspaceId,
  });
}

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api.getBoard(boardId),
  });
}

export function useGroups(boardId: string | undefined) {
  return useQuery({
    queryKey: ["groups", boardId],
    queryFn: () => api.listGroups(boardId!),
    enabled: !!boardId,
  });
}

export function useColumns(boardId: string) {
  return useQuery({
    queryKey: ["columns", boardId],
    queryFn: () => api.listColumns(boardId),
  });
}

export function useItems(boardId: string) {
  return useQuery({
    queryKey: ["items", boardId],
    queryFn: () => api.listItems(boardId),
  });
}
