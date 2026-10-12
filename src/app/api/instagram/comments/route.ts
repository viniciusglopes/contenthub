import { json, route } from "@/lib/api";
import { CATEGORY_LABEL } from "@/lib/comments/classify";
import { buildCommentsReport, buildStudy, gapMessage } from "@/lib/comments/study";
import { notFound } from "@/lib/errors";
import { gapOf, loadComments, replySwitch } from "@/lib/instagram/comments";
import { formatDateBR } from "@/lib/instagram/dates";
import { mockEnabled } from "@/lib/instagram/mock";
import { InstagramMedia } from "@/models/InstagramMedia";
import Post from "@/models/Post";
import SocialAccount from "@/models/SocialAccount";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Painel de UM post: a mídia, as métricas, os comentários guardados (com as respostas) e o
// estudo do post. ?media=<id da mídia no Instagram> ou ?post=<id do post do calendário>.
// Só lê o banco: quem busca no Instagram é POST /api/instagram/comments/sync.
export const GET = route("org", async ({ org, req, id, session }) => {
  const q = req.nextUrl.searchParams;
  let media: any = null;
  if (q.get("post")) {
    const post: any = await Post.findOne({ _id: id(q.get("post"), "Post"), organization: org }).lean();
    if (!post) throw notFound("Post");
    const igId = post.externalIds?.instagram;
    if (igId) media = await InstagramMedia.findOne({ organization: org, project: post.project, igId: String(igId) }).populate({ path: "post", select: "title", match: { organization: org } }).lean();
    if (!media) return json({ media: null, reason: "Esse post ainda não foi encontrado no Instagram. Depois de publicado, sincronize a conta para ver os comentários." });
  } else {
    const igId = String(q.get("media") || "");
    if (!/^\d{5,40}$/.test(igId)) throw notFound("Post");
    media = await InstagramMedia.findOne({ organization: org, igId }).populate({ path: "post", select: "title", match: { organization: org } }).sort({ updatedAt: -1 }).lean();
    if (!media) throw notFound("Post");
  }
  const account: any = await SocialAccount.findOne({ _id: media.account, organization: org }).lean();
  if (!account) throw notFound("Conta");
  const comments = await loadComments(org, account._id, { mediaIgId: media.igId });
  const gap = gapOf([media]);
  const study = buildStudy(comments);
  const sw = replySwitch(session!.organization);
  const reported = Number(media.commentsSync?.at ? media.commentsSync.reported ?? 0 : media.metrics?.comments ?? 0);
  return json({
    media: {
      igId: media.igId,
      kind: media.kind,
      caption: media.caption || "",
      title: media.post?.title || "",
      permalink: media.permalink || "",
      thumbnailUrl: media.thumbnailUrl || "",
      timestamp: media.timestamp,
      metrics: media.metrics || {},
      reported,
      synced: Boolean(media.commentsSync?.at) && !media.commentsSync?.error,
      syncedAt: media.commentsSync?.at ?? null,
      syncError: media.commentsSync?.error || "",
    },
    account: { _id: String(account._id), username: account.username || "" },
    gap: { ...gap, show: gap.reported > gap.fetched, message: gap.reported > gap.fetched ? gapMessage(gap) : "" },
    comments,
    study,
    report: buildCommentsReport({ username: account.username || account.accountName, scope: `Post de ${formatDateBR(media.timestamp, true)}`, study, gap }),
    labels: CATEGORY_LABEL,
    reply: { on: sw.on, message: sw.message },
    demo: mockEnabled(),
  });
});
