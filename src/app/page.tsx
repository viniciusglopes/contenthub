"use client";
/* eslint-disable react-hooks/set-state-in-effect -- estado inicial lido do link e do navegador */

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  List,
  Copy,
  Pencil,
  Trash2,
  X,
  Check,
  Settings,
  Plug,
  Eye,
  EyeOff,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  BarChart3,
  ClipboardCheck,
  Building2,
  UserCog,
  Wand2,
  Megaphone,
  Swords,
  HelpCircle,
} from "lucide-react";
import AdminClients from "@/components/admin/AdminClients";
import Onboarding from "@/components/Onboarding";
import TeamPanel, { type Me } from "@/components/team/TeamPanel";
import { BrandMark, DEFAULT_BRAND, rememberBrand, varsStyle } from "@/components/brand";
import InstagramPanel from "@/components/instagram/InstagramPanel";
import { InstagramAccountStatus, InstagramConnectForm } from "@/components/instagram/InstagramAccounts";
import type { PublicAccount } from "@/components/instagram/shared";
import ApprovalQueue from "@/components/posts/ApprovalQueue";
import PostDetail from "@/components/posts/PostDetail";
import PostForm from "@/components/posts/PostForm";
import StudioPanel from "@/components/studio/StudioPanel";
import HelpPanel from "@/components/help/HelpPanel";
import { helpFor } from "@/lib/help/map";
import TrafficPanel from "@/components/trafego/TrafficPanel";
import CompetitorsPanel from "@/components/concorrentes/CompetitorsPanel";
import { type PostT, STATUS, STATUS_ORDER, flowStatus, stateLine, statusOf } from "@/components/posts/flow";

interface Project {
  _id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  platforms: string[];
}

type Post = PostT;

type SocialAccount = PublicAccount;
type View = "calendar" | "list" | "aprovacoes" | "instagram" | "estudio" | "trafego" | "concorrentes" | "clientes" | "conta" | "ajuda";
const VIEW_TITLE: Record<string, string> = { estudio: "Estúdio", trafego: "Tráfego", concorrentes: "Concorrentes", instagram: "Instagram", clientes: "Clientes", conta: "Minha conta", aprovacoes: "Aprovações", ajuda: "Ajuda" };

const PLATFORM_FIELDS: Record<string, { label: string; fields: { key: string; label: string; secret?: boolean }[] }> = {
  instagram: {
    label: "Instagram / Meta Graph API",
    fields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App Secret", secret: true },
      { key: "accessToken", label: "Access Token", secret: true },
      { key: "pageId", label: "Page ID / IG User ID" },
    ],
  },
  facebook: {
    label: "Facebook / Meta Graph API",
    fields: [
      { key: "appId", label: "App ID" },
      { key: "appSecret", label: "App Secret", secret: true },
      { key: "accessToken", label: "Access Token", secret: true },
      { key: "pageId", label: "Page ID" },
    ],
  },
  tiktok: {
    label: "TikTok API",
    fields: [
      { key: "clientKey", label: "Client Key" },
      { key: "clientSecret", label: "Client Secret", secret: true },
      { key: "accessToken", label: "Access Token", secret: true },
    ],
  },
  youtube: {
    label: "YouTube / Google API",
    fields: [
      { key: "appId", label: "Client ID" },
      { key: "appSecret", label: "Client Secret", secret: true },
      { key: "refreshToken", label: "Refresh Token", secret: true },
      { key: "channelId", label: "Channel ID" },
    ],
  },
  twitter: {
    label: "Twitter / X API v2",
    fields: [
      { key: "apiKey", label: "API Key" },
      { key: "apiSecret", label: "API Secret", secret: true },
      { key: "accessToken", label: "Access Token", secret: true },
      { key: "bearerToken", label: "Bearer Token", secret: true },
    ],
  },
};

const FORMAT_COLORS: Record<string, string> = {
  reel: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  story: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  post: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  carrossel: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  shorts: "bg-red-500/20 text-red-400 border-red-500/30",
};

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  instagram: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>,
  youtube: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>,
  twitter: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  facebook: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>,
  tiktok: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.87a8.16 8.16 0 004.77 1.52V7a4.84 4.84 0 01-1.01-.31z"/></svg>,
};

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function formatDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [view, setViewState] = useState<View>("calendar");
  const [me, setMe] = useState<Me | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [igAccounts, setIgAccounts] = useState<SocialAccount[] | null>(null);
  const [onboardingClosed, setOnboardingClosed] = useState(false);
  const [onboardingSticky, setOnboardingSticky] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; msg: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false); // celular: menu como gaveta
  const [menuCollapsed, setMenuCollapsed] = useState(false); // desktop: recolhido, lembrando a escolha
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<Post | null>(null);
  const [queue, setQueue] = useState<Post[] | null>(null);
  const [publishOffClosed, setPublishOffClosed] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [copied, setCopied] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsProject, setSettingsProject] = useState<string>("");
  const [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]);
  const [editingAccount, setEditingAccount] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formPlatform, setFormPlatform] = useState("instagram");
  const [settingsTab, setSettingsTab] = useState<"social" | "apis">("social");
  const [apiCredentials, setApiCredentials] = useState<{ _id: string; service: string; label: string; credentials: Record<string, string>; credentialsFilled?: Record<string, boolean>; active: boolean }[]>([]);
  const [editingApi, setEditingApi] = useState<string | null>(null);
  const [showApiSecrets, setShowApiSecrets] = useState(false);
  const [formApiService, setFormApiService] = useState("");

  // A visão e o projeto ficam no link (dá para favoritar /?view=instagram&project=...).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get("view");
    if (v === "instagram" || v === "estudio" || v === "trafego" || v === "concorrentes" || v === "list" || v === "clientes" || v === "conta" || v === "aprovacoes" || v === "ajuda") setViewState(v);
    // Volta do login pelo Instagram: o resultado vem no link e sai dele depois de lido.
    const igOk = p.get("ig_ok");
    const igErro = p.get("ig_erro");
    if (igOk) setNotice({ tone: "ok", msg: `Instagram @${igOk} conectado. Clique em Sincronizar agora para trazer os números.` });
    else if (igErro) setNotice({ tone: "bad", msg: igErro });
    if (igOk || igErro) {
      const url = new URL(window.location.href);
      url.searchParams.delete("ig_ok");
      url.searchParams.delete("ig_erro");
      window.history.replaceState(null, "", url);
    }
    const proj = p.get("project");
    if (proj) setSelectedProject(proj);
    try {
      setMenuCollapsed(window.localStorage.getItem("ch-menu-recolhido") === "1");
    } catch { /* navegação privada */ }
  }, []);

  function setUrl(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  }
  function setView(v: View) {
    setViewState(v);
    setUrl("view", v === "calendar" ? null : v);
  }
  /** "?" de cada tela: abre na Ajuda o artigo daquela tela (o Estúdio e o Instagram olham a aba do link). */
  function openHelp(article?: string) {
    const p = new URLSearchParams(window.location.search);
    const id = article || helpFor(view, p.get("aba"));
    const url = new URL(window.location.href);
    url.searchParams.set("artigo", id);
    url.searchParams.delete("aba");
    window.history.replaceState(null, "", url);
    setShowSettings(false);
    setView("ajuda");
    setMenuOpen(false);
  }
  function selectProject(id: string) {
    setSelectedProject(id);
    setUrl("project", id === "all" ? null : id);
    setMenuOpen(false);
  }
  function toggleMenuCollapsed() {
    const next = !menuCollapsed;
    setMenuCollapsed(next);
    try {
      window.localStorage.setItem("ch-menu-recolhido", next ? "1" : "0");
    } catch { /* navegação privada */ }
  }
  function openSettings(projectId?: string, connectInstagram = false) {
    setShowSettings(true);
    setSettingsTab("social");
    setSettingsProject(projectId || "");
    loadSocialAccounts(projectId || undefined);
    loadApiCredentials();
    if (connectInstagram) {
      setFormPlatform("instagram");
      setEditingAccount("new");
    }
    setMenuOpen(false);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) {
      setProjects(await res.json());
      setProjectsLoaded(true);
    }
  }, []);

  // Quem sou eu, de qual cliente e com que marca (a cor entra por variáveis CSS).
  const loadMe = useCallback(async () => {
    const res = await fetch("/api/me");
    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }
    if (!res.ok) return;
    const data: Me = await res.json();
    setMe(data);
    document.title = `${data.brand.displayName} — Gestão de Conteúdo`;
    if (!data.impersonating) rememberBrand(data.organization.slug, data.brand, data.vars);
    try {
      setOnboardingClosed(window.localStorage.getItem(`ch-passos-fechado-${data.organization._id}`) === "1");
      // aviso "publicação automática desligada": fechado no X, só volta se a situação mudar
      setPublishOffClosed(window.localStorage.getItem(`ch-publicacao-aviso-${data.organization._id}`) === "desligada");
    } catch { /* navegação privada */ }
  }, []);

  // Fila de aprovação (e o que falhou): de qualquer mês, para o número no menu e a tela Aprovações.
  const loadQueue = useCallback(async () => {
    const res = await fetch("/api/posts?fila=aprovacao");
    if (res.ok) setQueue(await res.json());
  }, []);

  const loadIgAccounts = useCallback(async () => {
    const res = await fetch("/api/social-accounts");
    if (res.ok) setIgAccounts(await res.json());
  }, []);

  useEffect(() => { loadMe(); loadIgAccounts(); loadQueue(); }, [loadMe, loadIgAccounts, loadQueue]);

  async function leaveImpersonation() {
    await fetch("/api/admin/impersonate", { method: "DELETE" });
    window.location.href = "/?view=clientes";
  }
  function closeOnboarding() {
    setOnboardingClosed(true);
    setOnboardingSticky(false);
    try {
      if (me) window.localStorage.setItem(`ch-passos-fechado-${me.organization._id}`, "1");
    } catch { /* navegação privada */ }
  }

  const loadPosts = useCallback(async () => {
    const start = new Date(currentYear, currentMonth, 1);
    const end = new Date(currentYear, currentMonth + 1, 0);
    const params = new URLSearchParams({
      startDate: formatDateStr(start),
      endDate: formatDateStr(end),
    });
    if (selectedProject !== "all") params.set("project", selectedProject);
    if (selectedStatus !== "all") params.set("status", selectedStatus);
    const res = await fetch(`/api/posts?${params}`);
    if (res.ok) setPosts(await res.json());
  }, [currentMonth, currentYear, selectedProject, selectedStatus]);

  useEffect(() => { loadProjects(); }, [loadProjects]);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  const postsByDate = posts.reduce<Record<string, Post[]>>((acc, post) => {
    const key = post.scheduledDate.split("T")[0];
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    acc[key].sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    return acc;
  }, {});

  const prevMonth = () => {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(currentYear - 1); }
    else setCurrentMonth(currentMonth - 1);
  };
  const nextMonth = () => {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(currentYear + 1); }
    else setCurrentMonth(currentMonth + 1);
  };

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

  async function handleCreateProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get("name"),
      description: fd.get("description"),
      color: fd.get("color"),
      icon: fd.get("icon"),
      platforms: fd.getAll("platforms"),
    };
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowNewProject(false);
      loadProjects();
    }
  }

  function closePublishOff() {
    setPublishOffClosed(true);
    try {
      if (me) window.localStorage.setItem(`ch-publicacao-aviso-${me.organization._id}`, "desligada");
    } catch { /* navegação privada */ }
  }
  const refreshPosts = () => { loadPosts(); loadQueue(); };
  // Estúdio: abre o rascunho recém-criado no painel de detalhe (sobre a tela, sem sair do Estúdio)
  async function openPostById(id: string) {
    const res = await fetch(`/api/posts/${id}`);
    if (res.ok) setShowDetail(await res.json());
    refreshPosts();
  }
  // @usuario do Instagram de cada projeto, para a prévia do post
  const usernames = (igAccounts || []).reduce<Record<string, string>>((acc, a) => {
    const pid = typeof a.project === "string" ? a.project : a.project?._id;
    if (a.platform === "instagram" && a.username && pid && a.active) acc[pid] = a.username;
    return acc;
  }, {});
  const queueCount = (queue || []).filter((p) => (me?.canManage ? true : false) && ["pending", "failed", "missed"].includes(flowStatus(p.status))).length;

  function copyCaption(caption: string, id: string) {
    navigator.clipboard.writeText(caption);
    setCopied(id);
    setTimeout(() => setCopied(""), 2000);
  }

  const loadSocialAccounts = useCallback(async (projectId?: string) => {
    const params = projectId ? `?project=${projectId}` : "";
    const res = await fetch(`/api/social-accounts${params}`);
    if (res.ok) setSocialAccounts(await res.json());
  }, []);

  async function handleSaveSocialAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const platform = fd.get("platform") as string;
    const credentials: Record<string, string> = {};
    const fields = PLATFORM_FIELDS[platform]?.fields || [];
    for (const f of fields) {
      const val = fd.get(`cred_${f.key}`) as string;
      if (val) credentials[f.key] = val;
    }
    const data = {
      project: fd.get("project"),
      platform,
      accountName: fd.get("accountName"),
      accountId: fd.get("accountId") || "",
      credentials,
      active: true,
    };
    const url = editingAccount ? `/api/social-accounts/${editingAccount}` : "/api/social-accounts";
    const method = editingAccount ? "PUT" : "POST";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) {
      setEditingAccount(null);
      loadSocialAccounts(settingsProject || undefined);
    }
  }

  async function handleDeleteAccount(id: string) {
    await fetch(`/api/social-accounts/${id}`, { method: "DELETE" });
    loadSocialAccounts(settingsProject || undefined);
  }

  async function handleToggleAccount(id: string, active: boolean) {
    await fetch(`/api/social-accounts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    loadSocialAccounts(settingsProject || undefined);
  }

  const API_SERVICES: Record<string, { label: string; fields: { key: string; label: string; secret?: boolean }[] }> = {
    elevenlabs: {
      label: "ElevenLabs (Text-to-Speech)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "defaultVoiceId", label: "Voice ID padrao" },
        { key: "defaultLanguage", label: "Idioma padrao (pt-BR, es, en)" },
      ],
    },
    opusclip: {
      label: "Opus Clip (Video Clipping)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    freepik: {
      label: "Freepik / Magnific (Imagens IA + Upscale)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "webhookSecret", label: "Webhook Secret", secret: true },
      ],
    },
    gemini: {
      label: "Google Gemini (Roteiros IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "model", label: "Modelo (gemini-2.5-flash)" },
      ],
    },
    openai: {
      label: "OpenAI / ChatGPT",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "model", label: "Modelo (gpt-4o)" },
      ],
    },
    youtube: {
      label: "YouTube Data API (concorrentes)",
      fields: [
        { key: "apiKey", label: "Chave de API (começa com AIza)", secret: true },
      ],
    },
    anthropic: {
      label: "Anthropic / Claude",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "model", label: "Modelo (claude-sonnet-4-6)" },
      ],
    },
    stability: {
      label: "Stability AI (Imagens/Video)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    deepseek: {
      label: "DeepSeek",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "model", label: "Modelo (deepseek-chat)" },
      ],
    },
    runway: {
      label: "Runway ML (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    leonardo: {
      label: "Leonardo AI (Imagens)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    heygen: {
      label: "HeyGen (Avatares Digitais)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    suno: {
      label: "Suno AI (Musica IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    veo: {
      label: "Google Veo 3 (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    seedance: {
      label: "Seedance / ByteDance (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    kling: {
      label: "Kling AI (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
        { key: "accessSecret", label: "Access Secret", secret: true },
      ],
    },
    minimax: {
      label: "MiniMax / Hailuo (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    pika: {
      label: "Pika Labs (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    luma: {
      label: "Luma Dream Machine (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    midjourney: {
      label: "Midjourney (Imagens IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    alibaba: {
      label: "Alibaba / Wan (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    grok: {
      label: "Grok / xAI (IA + Imagens)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    veed: {
      label: "Veed (Edicao Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    pixverse: {
      label: "PixVerse (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
    ltx: {
      label: "LTX Studio (Video IA)",
      fields: [
        { key: "apiKey", label: "API Key", secret: true },
      ],
    },
  };

  const loadApiCredentials = useCallback(async () => {
    const res = await fetch("/api/api-credentials");
    if (res.ok) setApiCredentials(await res.json());
  }, []);

  async function handleSaveApiCredential(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const service = fd.get("service") as string;
    const fields = API_SERVICES[service]?.fields || [];
    const credentials: Record<string, string> = {};
    for (const f of fields) {
      const val = fd.get(`api_${f.key}`) as string;
      if (val) credentials[f.key] = val;
    }
    await fetch("/api/api-credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, label: API_SERVICES[service]?.label || service, credentials, active: true }),
    });
    setEditingApi(null);
    loadApiCredentials();
  }

  async function handleDeleteApiCredential(service: string) {
    await fetch(`/api/api-credentials?service=${service}`, { method: "DELETE" });
    loadApiCredentials();
  }

  const totalPosts = posts.length;
  const byStatus = posts.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] || 0) + 1;
    return acc;
  }, {});

  const brand = me?.brand || DEFAULT_BRAND;
  const calendarViews = view === "calendar" || view === "list";
  const igReady = (igAccounts || []).some((a) => a.platform === "instagram" && a.connected && a.lastSync);
  // Primeiros passos: sempre que não há projeto; depois, até conectar e sincronizar (ou fechar no X).
  const onboardingDue =
    Boolean(me) && projectsLoaded && igAccounts !== null && !igReady && (projects.length === 0 || !onboardingClosed);
  // Uma vez aberto nesta visita, fica até a pessoa concluir ("Ver meus números") ou fechar.
  const showOnboarding = (onboardingDue || onboardingSticky) && (calendarViews || (view === "instagram" && projects.length === 0));

  if (onboardingDue && !onboardingSticky && !onboardingClosed) setOnboardingSticky(true);

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={varsStyle(me?.vars)}>
      {me?.impersonating && (
        <div className="shrink-0 flex items-center justify-center gap-3 px-3 py-1.5 bg-fuchsia-600 text-white text-sm" role="status" data-testid="impersonation-bar">
          <span className="truncate">
            Você está vendo como <strong className="font-bold">{me.organization.name}</strong>
          </span>
          <span aria-hidden>·</span>
          <button type="button" onClick={leaveImpersonation} className="font-bold underline underline-offset-2 whitespace-nowrap hover:text-fuchsia-100">
            sair
          </button>
        </div>
      )}
      <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar: gaveta no celular, recolhível no desktop */}
      {menuOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setMenuOpen(false)} />}
      <aside
        className={`w-64 bg-gray-900 border-r border-gray-800 flex-col shrink-0 overflow-y-auto fixed inset-y-0 left-0 z-40 md:static md:z-auto ${
          menuOpen ? "flex" : "hidden"
        } ${menuCollapsed ? "md:hidden" : "md:flex"}`}
      >
        <div className="p-4 border-b border-gray-800 flex items-start justify-between">
          <div className="min-w-0">
            <h1 className="min-w-0"><BrandMark brand={brand} /></h1>
            <p className="text-xs text-gray-500 mt-1 truncate" title={me?.organization.name}>{me && me.organization.name !== brand.displayName ? me.organization.name : "Gestão de Conteúdo"}</p>
          </div>
          <button onClick={() => setMenuOpen(false)} className="p-1 hover:bg-gray-800 rounded md:hidden" aria-label="Fechar menu"><X size={18} /></button>
          <button onClick={toggleMenuCollapsed} className="p-1 hover:bg-gray-800 rounded text-gray-400 hidden md:block" aria-label="Recolher menu" title="Recolher menu"><PanelLeftClose size={18} /></button>
        </div>

        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Projetos</span>
            <button onClick={() => setShowNewProject(true)} className="text-brand-400 hover:text-brand-300">
              <Plus size={16} />
            </button>
          </div>
          <button
            onClick={() => selectProject("all")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${
              selectedProject === "all" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"
            }`}
          >
            Todos os projetos
          </button>
          {projects.map((p) => (
            <button
              key={p._id}
              onClick={() => selectProject(p._id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 flex items-center gap-2 transition ${
                selectedProject === p._id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"
              }`}
            >
              <span>{p.icon}</span>
              <span className="truncate" title={p.name}>{p.name}</span>
              <span className="w-2 h-2 rounded-full ml-auto shrink-0" style={{ backgroundColor: p.color }} />
            </button>
          ))}
        </div>

        <div className="p-4 border-b border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtro de status</span>
          <div className="mt-2 space-y-1">
            <button
              onClick={() => setSelectedStatus("all")}
              className={`w-full text-left px-3 py-1.5 rounded text-xs ${
                selectedStatus === "all" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-800/50"
              }`}
            >
              Todos
            </button>
            {STATUS_ORDER.map((key) => [key, STATUS[key].label] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedStatus(key)}
                className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 ${
                  selectedStatus === key ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-800/50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${STATUS[key].dot}`} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-gray-800 space-y-1">
          <button
            onClick={() => { setView("aprovacoes"); setMenuOpen(false); loadQueue(); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "aprovacoes" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
            data-testid="menu-aprovacoes"
          >
            <ClipboardCheck size={16} />
            <span>Aprovações</span>
            {queueCount > 0 && <span className="ml-auto text-[11px] font-bold bg-brand-500 text-brand-ink rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">{queueCount}</span>}
          </button>
          <button
            onClick={() => { setView("instagram"); setMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "instagram" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
          >
            <BarChart3 size={16} />
            <span>Instagram</span>
          </button>
          <button
            onClick={() => { setView("estudio"); setMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "estudio" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
            data-testid="menu-estudio"
          >
            <Wand2 size={16} />
            <span>Estúdio</span>
          </button>
          <button
            onClick={() => { setView("trafego"); setMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "trafego" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
            data-testid="menu-trafego"
          >
            <Megaphone size={16} />
            <span>Tráfego</span>
          </button>
          <button
            onClick={() => { setView("concorrentes"); setMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "concorrentes" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
            data-testid="menu-concorrentes"
          >
            <Swords size={16} />
            <span>Concorrentes</span>
          </button>
          <button
            onClick={() => openHelp("primeiros-passos")}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "ajuda" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
            data-testid="menu-ajuda"
          >
            <HelpCircle size={16} />
            <span>Ajuda</span>
          </button>
          {me?.isAdmin && (
            <button
              onClick={() => { setView("clientes"); setMenuOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "clientes" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
              data-testid="menu-clientes"
            >
              <Building2 size={16} />
              <span>Clientes</span>
            </button>
          )}
          <button
            onClick={() => { setView("conta"); setMenuOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${view === "conta" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"}`}
            data-testid="menu-conta"
          >
            <UserCog size={16} />
            <span>{me?.canManage ? "Minha conta e equipe" : "Minha conta"}</span>
          </button>
          <button
            onClick={() => openSettings()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800/50 transition"
          >
            <Settings size={16} />
            <span>Configurações</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800/50 transition"
          >
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>

        <div className="p-4 mt-auto border-t border-gray-800">
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Total do mês</span>
              <span className="text-white font-semibold">{totalPosts}</span>
            </div>
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between">
                <span>{statusOf(status).label}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="flex items-center justify-between gap-2 px-3 md:px-6 py-3 md:py-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
          <div className="flex items-center gap-1 md:gap-4 min-w-0">
            <button onClick={() => setMenuOpen(true)} className="p-2 hover:bg-gray-800 rounded md:hidden" aria-label="Abrir menu"><Menu size={20} /></button>
            {menuCollapsed && (
              <button onClick={toggleMenuCollapsed} className="p-2 hover:bg-gray-800 rounded text-gray-400 hidden md:block" aria-label="Mostrar menu" title="Mostrar menu"><PanelLeftOpen size={20} /></button>
            )}
            {!calendarViews ? (
              <h2 className="text-lg font-bold truncate">{VIEW_TITLE[view]}{view === "conta" && me?.canManage ? " e equipe" : ""}</h2>
            ) : (
              <>
                <button onClick={prevMonth} className="p-1 hover:bg-gray-800 rounded" aria-label="Mês anterior"><ChevronLeft size={20} /></button>
                <h2 className="text-base md:text-lg font-bold md:min-w-[200px] text-center truncate">{MONTHS_PT[currentMonth]} {currentYear}</h2>
                <button onClick={nextMonth} className="p-1 hover:bg-gray-800 rounded" aria-label="Próximo mês"><ChevronRight size={20} /></button>
                <button
                  onClick={() => { setCurrentMonth(new Date().getMonth()); setCurrentYear(new Date().getFullYear()); }}
                  className="text-xs text-brand-400 hover:text-brand-300 px-2 py-1 border border-brand-400/30 rounded hidden sm:block"
                >
                  Hoje
                </button>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {view !== "ajuda" && (
              <button onClick={() => openHelp()} title="Ajuda desta tela" aria-label="Ajuda desta tela" className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800" data-testid="ajuda-tela"><HelpCircle size={18} /></button>
            )}
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setView("calendar")} title="Calendario" aria-label="Calendario" className={`p-2 rounded ${view === "calendar" ? "bg-gray-700 text-white" : "text-gray-400"}`}><CalendarIcon size={16} /></button>
              <button onClick={() => setView("list")} title="Lista" aria-label="Lista" className={`p-2 rounded ${view === "list" ? "bg-gray-700 text-white" : "text-gray-400"}`}><List size={16} /></button>
              <button onClick={() => { setView("aprovacoes"); loadQueue(); }} title="Aprovações" aria-label="Aprovações" className={`p-2 rounded relative ${view === "aprovacoes" ? "bg-gray-700 text-white" : "text-gray-400"}`}>
                <ClipboardCheck size={16} />
                {queueCount > 0 && <span className="absolute -top-1 -right-1 text-[10px] font-bold bg-brand-500 text-brand-ink rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{queueCount}</span>}
              </button>
              <button onClick={() => setView("instagram")} title="Instagram: metricas" aria-label="Instagram: metricas" className={`p-2 rounded ${view === "instagram" ? "bg-gray-700 text-white" : "text-gray-400"}`}><BarChart3 size={16} /></button>
            </div>
            {calendarViews && projects.length > 0 && (
              <button
                onClick={() => { setEditingPost(null); setShowModal(true); }}
                className="flex items-center gap-2 bg-brand-500 text-brand-ink px-3 md:px-4 py-2 rounded-lg font-semibold text-sm hover:bg-brand-400 transition"
              >
                <Plus size={16} /> <span className="hidden sm:inline">Novo Post</span>
              </button>
            )}
          </div>
        </header>

        {notice && (
          <div className={`shrink-0 flex items-start gap-3 px-3 md:px-6 py-2 text-sm border-b border-gray-800 ${notice.tone === "ok" ? "bg-green-500/10 text-green-300" : "bg-red-500/10 text-red-300"}`} role={notice.tone === "ok" ? "status" : "alert"} data-testid="notice">
            <p className="flex-1">{notice.msg}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso" className="p-1 -m-1 opacity-80 hover:opacity-100"><X size={16} /></button>
          </div>
        )}
        {me?.publishing && !me.publishing.on && !publishOffClosed && (calendarViews || view === "aprovacoes") && (
          <div className="shrink-0 flex items-start gap-3 px-3 md:px-6 py-2 text-sm border-b border-gray-800 bg-gray-800/60 text-gray-300" role="status" data-testid="publish-off-banner">
            <p className="flex-1">{me.publishing.message}</p>
            <button type="button" onClick={closePublishOff} aria-label="Fechar aviso" className="p-1 -m-1 opacity-80 hover:opacity-100"><X size={16} /></button>
          </div>
        )}
        {view === "aprovacoes" && me ? (
          <ApprovalQueue posts={queue} canApprove={me.canManage} publishing={me.publishing} onOpen={(p) => setShowDetail(p)} onChanged={refreshPosts} />
        ) : view === "clientes" && me?.isAdmin ? (
          <AdminClients homeOrgId={me.impersonating ? "" : me.organization._id} />
        ) : view === "conta" && me ? (
          <TeamPanel me={me} onChanged={loadMe} />
        ) : view === "estudio" && me ? (
          <StudioPanel
            projects={projects}
            selectedProject={selectedProject}
            onSelectProject={selectProject}
            isAdmin={me.isAdmin && !me.impersonating}
            onDraft={() => refreshPosts()}
            onOpenPost={openPostById}
          />
        ) : view === "trafego" && me ? (
          <TrafficPanel projects={projects} selectedProject={selectedProject} onSelectProject={selectProject} canManage={me.canManage} />
        ) : view === "ajuda" && me ? (
          <HelpPanel projects={projects} selectedProject={selectedProject} onSelectProject={selectProject} />
        ) : view === "concorrentes" && me ? (
          <CompetitorsPanel projects={projects} selectedProject={selectedProject} onSelectProject={selectProject} onHelp={openHelp} />
        ) : !calendarViews && view !== "instagram" && view !== "estudio" ? (
          <p className="text-sm text-gray-400 py-16 text-center">{me ? "Essa área é só do administrador." : "Carregando..."}</p>
        ) : showOnboarding && projects.length === 0 ? (
          <div className="flex-1 overflow-auto p-3 md:p-8">
            <Onboarding
              projects={projects}
              accounts={igAccounts || []}
              igOauth={Boolean(me?.features.igOauth)}
              isAdmin={Boolean(me?.isAdmin)}
              brandName={brand.displayName}
              onProjectCreated={loadProjects}
              onAccountsChanged={loadIgAccounts}
              onFinish={(pid) => { setOnboardingSticky(false); if (pid) selectProject(pid); setView("instagram"); }}
              onDismiss={closeOnboarding}
            />
          </div>
        ) : view === "instagram" ? (
          <InstagramPanel
            projects={projects}
            selectedProject={selectedProject}
            onSelectProject={selectProject}
            onConnect={(pid) => openSettings(pid, true)}
          />
        ) : view === "calendar" ? (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {showOnboarding && (
              <Onboarding
                projects={projects}
                accounts={igAccounts || []}
                igOauth={Boolean(me?.features.igOauth)}
                isAdmin={Boolean(me?.isAdmin)}
                brandName={brand.displayName}
                onProjectCreated={loadProjects}
                onAccountsChanged={loadIgAccounts}
                onFinish={(pid) => { setOnboardingSticky(false); if (pid) selectProject(pid); setView("instagram"); }}
                onDismiss={closeOnboarding}
              />
            )}
            <div className="grid grid-cols-7 gap-px bg-gray-800 rounded-xl overflow-hidden">
              {DAYS_PT.map((day) => (
                <div key={day} className="bg-gray-900 p-2 text-center text-xs font-semibold text-gray-400">{day}</div>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="bg-gray-900/50 min-h-[120px]" />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayPosts = postsByDate[dateStr] || [];
                const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
                return (
                  <div key={day} className={`bg-gray-900 min-h-[120px] p-1.5 ${isToday ? "ring-2 ring-brand-500/50 ring-inset" : ""}`}>
                    <div className={`text-xs font-semibold mb-1 ${isToday ? "text-brand-400" : "text-gray-500"}`}>{day}</div>
                    <div className="space-y-1">
                      {dayPosts.slice(0, 4).map((post) => (
                        <button key={post._id} onClick={() => setShowDetail(post)} className="w-full text-left" title={`${post.title} · ${stateLine(post, me?.publishing)}`} data-testid="cal-post" data-status={flowStatus(post.status)}>
                          <div className="text-[10px] px-1 py-0.5 rounded border-l-2 flex items-center gap-1 min-w-0 hover:bg-gray-800" style={{ borderColor: post.project?.color || "#666" }}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusOf(post.status).dot}`} aria-label={statusOf(post.status).label} />
                            <span className="text-gray-500 shrink-0 hidden sm:inline">{post.scheduledTime}</span>
                            <span className="text-gray-300 truncate">{post.title}</span>
                          </div>
                        </button>
                      ))}
                      {dayPosts.length > 4 && <div className="text-[10px] text-gray-500 text-center">+{dayPosts.length - 4} mais</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            <div className="max-w-4xl mx-auto space-y-2">
              {Object.entries(postsByDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayPosts]) => (
                <div key={date} className="bg-gray-900 rounded-xl overflow-hidden">
                  <div className="px-4 py-2 bg-gray-800/50 text-sm font-semibold text-gray-400">
                    {new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
                    <span className="ml-2 text-gray-600">({dayPosts.length} posts)</span>
                  </div>
                  {dayPosts.map((post) => (
                    <div key={post._id} className="flex items-center gap-3 px-4 py-3 border-t border-gray-800 hover:bg-gray-800/30 cursor-pointer" onClick={() => setShowDetail(post)}>
                      <span className="text-xs text-gray-500 w-12">{post.scheduledTime}</span>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: post.project?.color || "#666" }} />
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${FORMAT_COLORS[post.format] || ""}`}>{post.format.toUpperCase()}</span>
                      <span className="text-sm text-gray-200 flex-1 truncate">{post.title}</span>
                      <div className="flex items-center gap-1">
                        {post.platforms.map((p) => <span key={p} className="text-gray-500">{PLATFORM_ICONS[p]}</span>)}
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded whitespace-nowrap max-w-[45%] truncate ${statusOf(post.status).chip}`} title={stateLine(post, me?.publishing)}>{flowStatus(post.status) === "scheduled" ? stateLine(post, me?.publishing).split(" · ")[0] : statusOf(post.status).label}</span>
                      <button onClick={(e) => { e.stopPropagation(); copyCaption(post.caption, post._id); }} className="text-gray-500 hover:text-brand-400" title="Copiar legenda">
                        {copied === post._id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              {posts.length === 0 && (
                <div className="text-center py-20 text-gray-600">
                  <CalendarIcon size={48} className="mx-auto mb-4 opacity-30" />
                  <p>Nenhum post nesse período</p>
                  <button onClick={() => { setEditingPost(null); setShowModal(true); }} className="mt-4 text-brand-400 text-sm hover:underline">Criar primeiro post</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {showDetail && !showModal && (
        <PostDetail
          key={showDetail._id}
          postId={showDetail._id}
          username={usernames[showDetail.project?._id] || ""}
          onClose={() => setShowDetail(null)}
          onEdit={(p) => { setEditingPost(p); setShowModal(true); }}
          onChanged={refreshPosts}
        />
      )}

      {showModal && (
        <PostForm
          post={editingPost}
          projects={projects}
          defaultProject={selectedProject !== "all" ? selectedProject : undefined}
          usernames={usernames}
          publishing={me?.publishing}
          onClose={() => { setShowModal(false); setEditingPost(null); }}
          onSaved={(p) => { setShowModal(false); setEditingPost(null); setShowDetail(p); refreshPosts(); }}
        />
      )}

      {/* Create Project Modal */}
      {showNewProject && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowNewProject(false)}>
          <div className="bg-gray-900 rounded-2xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-bold">Novo Projeto</h3>
              <button onClick={() => setShowNewProject(false)} className="p-1 hover:bg-gray-800 rounded"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateProject} className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400">Nome</label>
                <input name="name" required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" placeholder="Hora de Mudar o Jogo" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Descrição</label>
                <input name="description" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" placeholder="Perfil motivacional no Instagram" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Cor</label>
                  <input type="color" name="color" defaultValue="#f5c518" className="w-full h-10 bg-gray-800 border border-gray-700 rounded-lg mt-1 cursor-pointer" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Ícone (emoji)</label>
                  <input name="icon" defaultValue="" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Redes Sociais</label>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {["instagram", "tiktok", "youtube", "facebook", "twitter"].map((p) => (
                    <label key={p} className="flex items-center gap-1 text-xs text-gray-400">
                      <input type="checkbox" name="platforms" value={p} className="rounded bg-gray-800 border-gray-700" />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <button type="submit" className="w-full bg-brand-500 text-brand-ink font-bold py-2.5 rounded-lg hover:bg-brand-400 transition">
                Criar Projeto
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setShowSettings(false); setEditingAccount(null); }}>
          <div className="bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Plug size={20} className="text-brand-400" />
                <h3 className="font-bold text-white">Configurações</h3>
                <button type="button" onClick={() => openHelp(settingsTab === "social" ? "token-instagram" : "chaves-e-integracoes")} title="Ajuda" aria-label="Ajuda das configurações" className="p-1 text-gray-400 hover:text-white"><HelpCircle size={16} /></button>
              </div>
              <button onClick={() => { setShowSettings(false); setEditingAccount(null); setEditingApi(null); }} className="p-1 hover:bg-gray-800 rounded"><X size={16} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setSettingsTab("social")}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${settingsTab === "social" ? "text-brand-400 border-b-2 border-brand-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                <Plug size={14} className="inline mr-1.5" /> Redes Sociais
              </button>
              <button
                onClick={() => { setSettingsTab("apis"); loadApiCredentials(); }}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${settingsTab === "apis" ? "text-brand-400 border-b-2 border-brand-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                🔧 APIs de Produção
              </button>
            </div>

            {settingsTab === "social" && (<>
            <div className="p-4 border-b border-gray-800">
              <label className="text-xs text-gray-400">Filtrar por Projeto</label>
              <select
                value={settingsProject}
                onChange={(e) => { setSettingsProject(e.target.value); loadSocialAccounts(e.target.value || undefined); }}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
              >
                <option value="">Todos os projetos</option>
                {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
              </select>
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-300">Contas Conectadas</span>
                <button
                  onClick={() => setEditingAccount("new")}
                  className="flex items-center gap-1 text-xs bg-brand-500 text-brand-ink px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-400 transition"
                >
                  <Plus size={14} /> Adicionar Conta
                </button>
              </div>

              {socialAccounts.length === 0 && !editingAccount && (
                <div className="text-center py-10 text-gray-600">
                  <Plug size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma conta conectada</p>
                  <p className="text-xs text-gray-700 mt-1">Adicione contas para habilitar postagem automatica</p>
                </div>
              )}

              {socialAccounts.map((acc) => (
                <div key={acc._id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-gray-300">{PLATFORM_ICONS[acc.platform]}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-200 truncate" title={acc.accountName}>{acc.accountName}</div>
                        <div className="text-xs text-gray-500 truncate">{PLATFORM_FIELDS[acc.platform]?.label || acc.platform}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded ${acc.active ? "bg-green-500/20 text-green-400" : "bg-gray-600/20 text-gray-500"}`}>
                        {acc.active ? "Ativo" : "Inativo"}
                      </span>
                      <button onClick={() => handleToggleAccount(acc._id, acc.active)} className="p-1 hover:bg-gray-700 rounded text-gray-400" title={acc.active ? "Desativar" : "Ativar"}>
                        {acc.active ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button onClick={() => { setEditingAccount(acc._id); setFormPlatform(acc.platform); }} className="p-1 hover:bg-gray-700 rounded text-gray-400"><Pencil size={14} /></button>
                      <button onClick={() => handleDeleteAccount(acc._id)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {acc.platform === "instagram" ? (
                    <InstagramAccountStatus
                      account={acc}
                      onChange={() => loadSocialAccounts(settingsProject || undefined)}
                    />
                  ) : (
                    <>
                      {acc.accountId && <div className="text-xs text-gray-600 mt-1">ID: {acc.accountId}</div>}
                      {acc.tokenExpiresAt && (
                        <div className="text-xs text-gray-600 mt-1">
                          Token expira: {new Date(acc.tokenExpiresAt).toLocaleDateString("pt-BR")}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}

              {editingAccount && formPlatform === "instagram" && (
                <div className="space-y-2">
                  {editingAccount === "new" && (
                    <div>
                      <label className="text-xs text-gray-400">Plataforma</label>
                      <select
                        value={formPlatform}
                        onChange={(e) => setFormPlatform(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                      >
                        {Object.entries(PLATFORM_FIELDS).map(([key, val]) => (
                          <option key={key} value={key}>{key === "instagram" ? "Instagram (API oficial da Meta)" : val.label}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <InstagramConnectForm
                    key={editingAccount}
                    projects={projects}
                    defaultProject={settingsProject}
                    oauth={Boolean(me?.features.igOauth)}
                    isAdmin={Boolean(me?.isAdmin)}
                    account={editingAccount !== "new" ? socialAccounts.find((a) => a._id === editingAccount) : null}
                    onDone={() => { setEditingAccount(null); loadSocialAccounts(settingsProject || undefined); loadIgAccounts(); }}
                    onCancel={() => setEditingAccount(null)}
                  />
                </div>
              )}

              {editingAccount && formPlatform !== "instagram" && (
                <div className="bg-gray-800/50 rounded-xl p-4 border border-brand-500/30">
                  <h4 className="text-sm font-semibold text-brand-400 mb-3">
                    {editingAccount === "new" ? "Nova Conta" : "Editar Conta"}
                  </h4>
                  <form onSubmit={handleSaveSocialAccount} className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400">Projeto</label>
                      <select
                        name="project"
                        defaultValue={settingsProject || (editingAccount !== "new" ? (socialAccounts.find(a => a._id === editingAccount)?.project as Project)?._id : "")}
                        required
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                      >
                        <option value="">Selecione...</option>
                        {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-400">Plataforma</label>
                        <select
                          name="platform"
                          value={formPlatform}
                          onChange={(e) => setFormPlatform(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                        >
                          {Object.entries(PLATFORM_FIELDS).map(([key, val]) => (
                            <option key={key} value={key}>{val.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Nome da Conta</label>
                        <input
                          name="accountName"
                          defaultValue={editingAccount !== "new" ? socialAccounts.find(a => a._id === editingAccount)?.accountName : ""}
                          required
                          placeholder="@horademudarojogo"
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-400">Account ID (opcional)</label>
                      <input
                        name="accountId"
                        defaultValue={editingAccount !== "new" ? socialAccounts.find(a => a._id === editingAccount)?.accountId : ""}
                        placeholder="ID numerico da conta na plataforma"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                      />
                    </div>
                    <div className="border-t border-gray-700 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Credenciais da API</span>
                        <button
                          type="button"
                          onClick={() => setShowSecrets(prev => ({ ...prev, [editingAccount]: !prev[editingAccount] }))}
                          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                        >
                          {showSecrets[editingAccount] ? <><EyeOff size={12} /> Ocultar</> : <><Eye size={12} /> Mostrar</>}
                        </button>
                      </div>
                      {(PLATFORM_FIELDS[formPlatform]?.fields || []).map((field) => (
                        <div key={field.key}>
                          <label className="text-xs text-gray-500">{field.label}</label>
                          <input
                            name={`cred_${field.key}`}
                            type={field.secret && !showSecrets[editingAccount!] ? "password" : "text"}
                            defaultValue={editingAccount !== "new" ? socialAccounts.find(a => a._id === editingAccount)?.credentials?.[field.key] || "" : ""}
                            placeholder={editingAccount !== "new" && socialAccounts.find(a => a._id === editingAccount)?.credentialsFilled?.[field.key] && field.secret ? "Ja preenchido: deixe em branco para manter" : field.label}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="flex-1 bg-brand-500 text-brand-ink font-bold py-2 rounded-lg hover:bg-brand-400 transition text-sm">
                        Salvar
                      </button>
                      <button type="button" onClick={() => setEditingAccount(null)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition text-sm">
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
            </>)}

            {settingsTab === "apis" && (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-gray-300">APIs de Produção de Video</span>
                  <p className="text-xs text-gray-600 mt-0.5">Credenciais para geracao de roteiros, audio, imagens e corte de video</p>
                </div>
                {!editingApi && (
                  <button
                    onClick={() => { setEditingApi("new"); setFormApiService(""); }}
                    className="flex items-center gap-1 text-xs bg-brand-500 text-brand-ink px-3 py-1.5 rounded-lg font-semibold hover:bg-brand-400 transition"
                  >
                    <Plus size={14} /> Adicionar API
                  </button>
                )}
              </div>

              {apiCredentials.length === 0 && !editingApi && (
                <div className="text-center py-10 text-gray-600">
                  <Settings size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhuma API configurada</p>
                  <p className="text-xs text-gray-700 mt-1">Adicione ElevenLabs, Opus Clip e Freepik para habilitar producao automatizada</p>
                </div>
              )}

              {apiCredentials.map((api) => (
                <div key={api._id} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-gray-200">{API_SERVICES[api.service]?.label || api.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {Object.keys(api.credentialsFilled || api.credentials || {}).length} campo(s) configurado(s)
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${api.active ? "bg-green-500/20 text-green-400" : "bg-gray-600/20 text-gray-500"}`}>
                        {api.active ? "Ativo" : "Inativo"}
                      </span>
                      <button onClick={() => { setEditingApi(api.service); setFormApiService(api.service); }} className="p-1 hover:bg-gray-700 rounded text-gray-400"><Pencil size={14} /></button>
                      <button onClick={() => handleDeleteApiCredential(api.service)} className="p-1 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}

              {editingApi && (
                <div className="bg-gray-800/50 rounded-xl p-4 border border-brand-500/30">
                  <h4 className="text-sm font-semibold text-brand-400 mb-3">
                    {editingApi === "new" ? "Nova API" : `Editar ${API_SERVICES[editingApi]?.label || editingApi}`}
                  </h4>
                  <form onSubmit={handleSaveApiCredential} className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-400">Servico</label>
                      <select
                        name="service"
                        value={formApiService}
                        onChange={(e) => setFormApiService(e.target.value)}
                        required
                        disabled={editingApi !== "new"}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100 disabled:opacity-50"
                      >
                        <option value="">Selecione...</option>
                        {Object.entries(API_SERVICES).map(([key, val]) => (
                          <option key={key} value={key}>{val.label}</option>
                        ))}
                      </select>
                    </div>
                    {formApiService && API_SERVICES[formApiService] && (
                    <div className="border-t border-gray-700 pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Credenciais</span>
                        <button
                          type="button"
                          onClick={() => setShowApiSecrets(!showApiSecrets)}
                          className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                        >
                          {showApiSecrets ? <><EyeOff size={12} /> Ocultar</> : <><Eye size={12} /> Mostrar</>}
                        </button>
                      </div>
                      {API_SERVICES[formApiService].fields.map((field) => (
                        <div key={field.key} className="mb-2">
                          <label className="text-xs text-gray-500">{field.label}</label>
                          <input
                            name={`api_${field.key}`}
                            type={field.secret && !showApiSecrets ? "password" : "text"}
                            defaultValue={editingApi !== "new" ? apiCredentials.find(a => a.service === editingApi)?.credentials?.[field.key] || "" : ""}
                            placeholder={editingApi !== "new" && apiCredentials.find(a => a.service === editingApi)?.credentialsFilled?.[field.key] && field.secret ? "Ja preenchido: deixe em branco para manter" : field.label}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                          />
                        </div>
                      ))}
                    </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="flex-1 bg-brand-500 text-brand-ink font-bold py-2 rounded-lg hover:bg-brand-400 transition text-sm">
                        Salvar
                      </button>
                      <button type="button" onClick={() => setEditingApi(null)} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition text-sm">
                        Cancelar
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
