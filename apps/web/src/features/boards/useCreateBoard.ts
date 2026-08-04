import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import * as api from "../../lib/api-client";
import { DEFAULT_STATUS_SETTINGS } from "./defaults";

/**
 * Creates a board with the doc 07 §3 scratch-board shape (default group
 * + status column, composed client-side from existing endpoints) and
 * navigates to it. Shared by the sidebar and the dashboard.
 */
export function useCreateBoard(workspaceId: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { board } = await api.createBoard(workspaceId!, { name });
      await api.createGroup(board.id, { title: "Group 1" });
      await api.createColumn(board.id, {
        title: "Status",
        type: "status",
        settings: DEFAULT_STATUS_SETTINGS,
      });
      return board;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ["boards", workspaceId] });
      navigate(`/boards/${board.id}`);
    },
  });
}
