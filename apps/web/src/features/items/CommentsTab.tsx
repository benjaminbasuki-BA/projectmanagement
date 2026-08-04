import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { Comment } from "../../lib/api-client";
import { useComments, useMe } from "../../lib/queries";

const QUICK_REACTIONS = ["👍", "❤️", "🎉"];

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Item "Updates" thread (doc 02 §5.1). Plain-text composer for now — see
 * apps/api's schemas.ts header comment on the TipTap follow-up; the
 * jsonb `body` shape it writes is already forward-compatible.
 */
export function CommentsTab({ itemId }: { itemId: string }) {
  const { data: me } = useMe();
  const { data, isPending } = useComments(itemId);
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["comments", itemId] });
    queryClient.invalidateQueries({ queryKey: ["activity", itemId] });
  };

  const post = useMutation({
    mutationFn: (input: { bodyText: string; parentCommentId?: string }) =>
      api.createComment(itemId, input),
    onSuccess: invalidate,
  });

  if (isPending) {
    return <p className="py-4 text-sm text-neutral-400">Loading updates…</p>;
  }

  const comments = data?.comments ?? [];
  const roots = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (!c.parentCommentId) continue;
    const list = repliesByParent.get(c.parentCommentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentCommentId, list);
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <Composer
        placeholder="Post an update…"
        onSubmit={(text) => post.mutate({ bodyText: text })}
        pending={post.isPending}
      />

      {roots.length === 0 && (
        <p className="py-2 text-sm text-neutral-400">
          No updates yet — post the first one above.
        </p>
      )}

      <div className="flex flex-col gap-5">
        {roots.map((c) => (
          <div key={c.id} className="flex flex-col gap-2">
            <CommentRow
              comment={c}
              itemId={itemId}
              meId={me?.user.id}
              onChanged={invalidate}
              allowReply
            />
            {(repliesByParent.get(c.id) ?? []).map((reply) => (
              <div key={reply.id} className="pl-8">
                <CommentRow
                  comment={reply}
                  itemId={itemId}
                  meId={me?.user.id}
                  onChanged={invalidate}
                  allowReply={false}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  itemId,
  meId,
  onChanged,
  allowReply,
}: {
  comment: Comment;
  itemId: string;
  meId: string | undefined;
  onChanged: () => void;
  allowReply: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const isOwn = comment.authorId === meId;
  const isDeleted = Boolean(comment.deletedAt);

  const edit = useMutation({
    mutationFn: (bodyText: string) => api.updateComment(comment.id, bodyText),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.deleteComment(comment.id),
    onSuccess: onChanged,
  });

  const reply = useMutation({
    mutationFn: (bodyText: string) =>
      api.createComment(itemId, { bodyText, parentCommentId: comment.id }),
    onSuccess: () => {
      setReplying(false);
      onChanged();
    },
  });

  const toggleReaction = useMutation({
    mutationFn: async (emoji: string) => {
      const already = comment.reactions.some(
        (r) => r.userId === meId && r.emoji === emoji,
      );
      if (already) return api.removeReaction(comment.id, emoji);
      return api.addReaction(comment.id, emoji);
    },
    onSuccess: onChanged,
  });

  if (isDeleted) {
    return (
      <div className="flex items-start gap-2.5">
        <Avatar name={comment.authorName} size={26} />
        <p className="pt-0.5 text-sm text-neutral-400 italic">
          {comment.authorName} deleted a message
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar name={comment.authorName} size={26} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-neutral-900">
            {comment.authorName}
          </span>
          <span className="text-[11px] text-neutral-400">
            {formatWhen(comment.createdAt)}
            {comment.editedAt ? " (edited)" : ""}
          </span>
        </div>

        {editing ? (
          <Composer
            initialValue={comment.bodyText}
            onSubmit={(text) => edit.mutate(text)}
            onCancel={() => setEditing(false)}
            pending={edit.isPending}
            compact
          />
        ) : (
          <p className="mt-0.5 text-sm whitespace-pre-wrap text-neutral-700">
            {comment.bodyText}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {QUICK_REACTIONS.map((emoji) => {
            const count = comment.reactions.filter(
              (r) => r.emoji === emoji,
            ).length;
            const mine = comment.reactions.some(
              (r) => r.userId === meId && r.emoji === emoji,
            );
            return (
              <button
                key={emoji}
                onClick={() => toggleReaction.mutate(emoji)}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                  mine
                    ? "border-neutral-300 bg-neutral-100"
                    : "border-transparent text-neutral-400 hover:border-neutral-200"
                }`}
              >
                <span>{emoji}</span>
                {count > 0 && <span>{count}</span>}
              </button>
            );
          })}
          {allowReply && !editing && (
            <button
              onClick={() => setReplying((r) => !r)}
              className="text-xs text-neutral-400 hover:text-neutral-600"
            >
              Reply
            </button>
          )}
          {isOwn && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-neutral-400 hover:text-neutral-600"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Delete this update?")) remove.mutate();
                }}
                className="text-xs text-neutral-400 hover:text-red-600"
              >
                Delete
              </button>
            </>
          )}
        </div>

        {replying && (
          <div className="mt-2">
            <Composer
              placeholder={`Reply to ${comment.authorName}…`}
              onSubmit={(text) => reply.mutate(text)}
              onCancel={() => setReplying(false)}
              pending={reply.isPending}
              compact
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Composer({
  placeholder,
  initialValue = "",
  onSubmit,
  onCancel,
  pending,
  compact = false,
}: {
  placeholder?: string;
  initialValue?: string;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
  pending: boolean;
  compact?: boolean;
}) {
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    const text = value.trim();
    if (!text || pending) return;
    onSubmit(text);
    if (!initialValue) setValue("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape" && onCancel) {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={submit}
          disabled={!value.trim() || pending}
          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          {initialValue ? "Save" : "Comment"}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
