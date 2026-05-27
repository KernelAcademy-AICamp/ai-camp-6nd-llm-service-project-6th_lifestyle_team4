-- ============================================================================
--  card_comments.parent_comment_id — 대댓글 지원
--   - null: 최상위 댓글
--   - not null: 해당 comment_id에 대한 답글
--   - 부모 댓글이 삭제되면 답글도 같이 삭제 (cascade)
--   - 깊이는 1단계만 (답글의 답글은 만들지 않음; UI에서 reply 버튼은 top-level에만)
-- ============================================================================

alter table public.card_comments
  add column if not exists parent_comment_id bigint
    references public.card_comments(comment_id) on delete cascade;

create index if not exists card_comments_parent_idx
  on public.card_comments (parent_comment_id)
  where parent_comment_id is not null;
