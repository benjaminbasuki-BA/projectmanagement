import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import * as api from "../../lib/api-client";
import { DEFAULT_STATUS_SETTINGS } from "./defaults";

/**
 * Creates a board and navigates to it. With no template, this is the
 * doc 07 §3 scratch-board shape (default group + status column, composed
 * client-side from existing endpoints); with a template id, the server
 * builds the whole board — groups, columns, and sample items — in one
 * call (boards.routes.ts's instantiateTemplate). Shared by the sidebar
 * and the dashboard.
 */
export function useCreateBoard(workspaceId: string | undefined) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: string | { name: string; templateId: string },
    ) => {
      if (typeof input === "string") {
        const { board } = await api.createBoard(workspaceId!, { name: input });
        await api.createGroup(board.id, { title: "Group 1" });
        await api.createColumn(board.id, {
          title: "Status",
          type: "status",
          settings: DEFAULT_STATUS_SETTINGS,
        });
        return board;
      }
      const { board } = await api.createBoard(workspaceId!, input);
      return board;
    },
    onSuccess: (board) => {
      queryClient.invalidateQueries({ queryKey: ["boards", workspaceId] });
      navigate(`/boards/${board.id}`);
    },
  });
}
