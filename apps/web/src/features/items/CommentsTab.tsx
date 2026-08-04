import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar } from "@trellis/ui";
import * as api from "../../lib/api-client";
import type { Comment, OrgUser } from "../../lib/api-client";
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
    mutationFn: (input: {
      bodyText: string;
      parentCommentId?: string;
      mentionedUserIds?: string[];
    }) => api.createComment(itemId, input),
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
        placeholder="Post an update… (@ to mention someone)"
        onSubmit={(text, mentionedUserIds) =>
          post.mutate({ bodyText: text, mentionedUserIds })
        }
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
    mutationFn: ({
      bodyText,
      mentionedUserIds,
    }: {
      bodyText: string;
      mentionedUserIds: string[];
    }) =>
      api.createComment(itemId, {
        bodyText,
        parentCommentId: comment.id,
        mentionedUserIds,
      }),
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
            disableMentions
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
              placeholder={`Reply to ${comment.authorName}… (@ to mention someone)`}
              onSubmit={(text, mentionedUserIds) =>
                reply.mutate({ bodyText: text, mentionedUserIds })
              }
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

/** Matches an in-progress `@partial` token ending at the cursor. */
const MENTION_TRIGGER = /(?:^|\s)@(\w*)$/;

function Composer({
  placeholder,
  initialValue = "",
  onSubmit,
  onCancel,
  pending,
  compact = false,
  disableMentions = false,
}: {
  placeholder?: string;
  initialValue?: string;
  onSubmit: (text: string, mentionedUserIds: string[]) => void;
  onCancel?: () => void;
  pending: boolean;
  compact?: boolean;
  disableMentions?: boolean;
}) {
  const [value, setValue] = useState(initialValue);
  // Tracks every user ever inserted via the picker, keyed by id → the
  // literal "@Name" text that was inserted. At submit time only the ones
  // still present in the text count — deleting the "@Name" un-mentions
  // them without needing to track exact character ranges.
  const [mentioned, setMentioned] = useState<Map<string, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const suggestions = useQuery({
    queryKey: ["org-users", mentionQuery],
    queryFn: () => api.searchOrgUsers(mentionQuery ?? ""),
    enabled: !disableMentions && mentionQuery !== null,
  });
  const results = suggestions.data?.users ?? [];

  const updateMentionTrigger = (text: string, cursor: number) => {
    if (disableMentions) return;
    const match = MENTION_TRIGGER.exec(text.slice(0, cursor));
    setMentionQuery(match ? match[1]! : null);
    setActiveIndex(0);
  };

  const selectMention = (user: OrgUser) => {
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const match = MENTION_TRIGGER.exec(value.slice(0, cursor));
    if (!match) return;

    const matchStart = cursor - match[0].length + (match[0][0] === " " ? 1 : 0);
    const mentionText = `@${user.name}`;
    const next = `${value.slice(0, matchStart)}${mentionText} ${value.slice(cursor)}`;
    setValue(next);
    setMentioned((prev) => new Map(prev).set(user.id, mentionText));
    setMentionQuery(null);

    const caret = matchStart + mentionText.length + 1;
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });
  };

  const submit = () => {
    const text = value.trim();
    if (!text || pending) return;
    const mentionedUserIds = Array.from(mentioned.entries())
      .filter(([, mentionText]) => value.includes(mentionText))
      .map(([id]) => id);
    onSubmit(text, mentionedUserIds);
    if (!initialValue) {
      setValue("");
      setMentioned(new Map());
    }
  };

  return (
    <div className="relative flex flex-col gap-1.5">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          updateMentionTrigger(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) =>
          updateMentionTrigger(value, e.currentTarget.selectionStart)
        }
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        className="w-full resize-none rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
        onKeyDown={(e) => {
          if (mentionQuery !== null && results.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % results.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + results.length) % results.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              selectMention(results[activeIndex]!);
              return;
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setMentionQuery(null);
              return;
            }
          }
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
      {mentionQuery !== null && results.length > 0 && (
        <div className="absolute top-full left-0 z-10 mt-1 w-56 rounded-md border border-neutral-200 bg-white py-1 shadow-md">
          {results.map((user, i) => (
            <button
              key={user.id}
              onMouseDown={(e) => {
                e.preventDefault();
                selectMention(user);
              }}
              className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] ${
                i === activeIndex
                  ? "bg-neutral-100 text-neutral-900"
                  : "text-neutral-700"
              }`}
            >
              <Avatar name={user.name} size={20} />
              <span className="truncate">{user.name}</span>
            </button>
          ))}
        </div>
      )}
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
