"use client";

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
  Clock,
  Settings,
  Plug,
  Eye,
  EyeOff,
} from "lucide-react";

interface Project {
  _id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  platforms: string[];
}

interface Post {
  _id: string;
  project: Project;
  title: string;
  content: string;
  caption: string;
  format: string;
  platforms: string[];
  scheduledDate: string;
  scheduledTime: string;
  status: string;
  tags: string[];
  hashtags: string[];
  cta: string;
  productionNotes: string;
}

interface SocialAccount {
  _id: string;
  project: Project | string;
  platform: string;
  accountName: string;
  accountId: string;
  credentials: Record<string, string>;
  active: boolean;
  lastSync: string | null;
  tokenExpiresAt: string | null;
}

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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  approved: "bg-yellow-500/20 text-yellow-400",
  scheduled: "bg-blue-500/20 text-blue-400",
  posted: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovado",
  scheduled: "Agendado",
  posted: "Postado",
  failed: "Falhou",
};

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  instagram: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>,
  youtube: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/><path d="m10 15 5-3-5-3z"/></svg>,
  twitter: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  facebook: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>,
  tiktok: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.87a8.16 8.16 0 004.77 1.52V7a4.84 4.84 0 01-1.01-.31z"/></svg>,
};

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
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
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState<Post | null>(null);
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
  const [apiCredentials, setApiCredentials] = useState<{ _id: string; service: string; label: string; credentials: Record<string, string>; active: boolean }[]>([]);
  const [editingApi, setEditingApi] = useState<string | null>(null);
  const [showApiSecrets, setShowApiSecrets] = useState(false);
  const [formApiService, setFormApiService] = useState("");

  const loadProjects = useCallback(async () => {
    const res = await fetch("/api/projects");
    if (res.ok) setProjects(await res.json());
  }, []);

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

  async function handleSavePost(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      project: fd.get("project"),
      title: fd.get("title"),
      content: fd.get("content"),
      caption: fd.get("caption"),
      format: fd.get("format"),
      platforms: fd.getAll("platforms"),
      scheduledDate: fd.get("scheduledDate"),
      scheduledTime: fd.get("scheduledTime"),
      status: fd.get("status"),
      cta: fd.get("cta"),
      productionNotes: fd.get("productionNotes"),
      hashtags: (fd.get("hashtags") as string || "").split(" ").filter(Boolean),
    };

    const url = editingPost ? `/api/posts/${editingPost._id}` : "/api/posts";
    const method = editingPost ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      setShowModal(false);
      setEditingPost(null);
      loadPosts();
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setShowDetail(null);
      loadPosts();
    }
  }

  async function handleStatusChange(id: string, status: string) {
    await fetch(`/api/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadPosts();
    if (showDetail?._id === id) {
      setShowDetail({ ...showDetail, status });
    }
  }

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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold text-yellow-400">ContentHub</h1>
          <p className="text-xs text-gray-500 mt-1">Gestao de Conteudo</p>
        </div>

        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Projetos</span>
            <button onClick={() => setShowNewProject(true)} className="text-yellow-400 hover:text-yellow-300">
              <Plus size={16} />
            </button>
          </div>
          <button
            onClick={() => setSelectedProject("all")}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 transition ${
              selectedProject === "all" ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"
            }`}
          >
            Todos os projetos
          </button>
          {projects.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelectedProject(p._id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 flex items-center gap-2 transition ${
                selectedProject === p._id ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.name}</span>
              <span className="w-2 h-2 rounded-full ml-auto" style={{ backgroundColor: p.color }} />
            </button>
          ))}
        </div>

        <div className="p-4 border-b border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filtro Status</span>
          <div className="mt-2 space-y-1">
            <button
              onClick={() => setSelectedStatus("all")}
              className={`w-full text-left px-3 py-1.5 rounded text-xs ${
                selectedStatus === "all" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-800/50"
              }`}
            >
              Todos
            </button>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSelectedStatus(key)}
                className={`w-full text-left px-3 py-1.5 rounded text-xs flex items-center gap-2 ${
                  selectedStatus === key ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-800/50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[key].split(" ")[0]}`} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-gray-800">
          <button
            onClick={() => { setShowSettings(true); setSettingsTab("social"); loadSocialAccounts(); loadApiCredentials(); }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800/50 transition"
          >
            <Settings size={16} />
            <span>Configuracoes</span>
          </button>
        </div>

        <div className="p-4 mt-auto border-t border-gray-800">
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Total do mes</span>
              <span className="text-white font-semibold">{totalPosts}</span>
            </div>
            {Object.entries(byStatus).map(([status, count]) => (
              <div key={status} className="flex justify-between">
                <span>{STATUS_LABELS[status]}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="p-1 hover:bg-gray-800 rounded"><ChevronLeft size={20} /></button>
            <h2 className="text-lg font-bold min-w-[200px] text-center">{MONTHS_PT[currentMonth]} {currentYear}</h2>
            <button onClick={nextMonth} className="p-1 hover:bg-gray-800 rounded"><ChevronRight size={20} /></button>
            <button
              onClick={() => { setCurrentMonth(new Date().getMonth()); setCurrentYear(new Date().getFullYear()); }}
              className="text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 border border-yellow-400/30 rounded"
            >
              Hoje
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button onClick={() => setView("calendar")} className={`p-2 rounded ${view === "calendar" ? "bg-gray-700 text-white" : "text-gray-400"}`}><CalendarIcon size={16} /></button>
              <button onClick={() => setView("list")} className={`p-2 rounded ${view === "list" ? "bg-gray-700 text-white" : "text-gray-400"}`}><List size={16} /></button>
            </div>
            <button
              onClick={() => { setEditingPost(null); setShowModal(true); }}
              className="flex items-center gap-2 bg-yellow-500 text-black px-4 py-2 rounded-lg font-semibold text-sm hover:bg-yellow-400 transition"
            >
              <Plus size={16} /> Novo Post
            </button>
          </div>
        </header>

        {view === "calendar" ? (
          <div className="flex-1 overflow-auto p-4">
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
                  <div key={day} className={`bg-gray-900 min-h-[120px] p-1.5 ${isToday ? "ring-2 ring-yellow-500/50 ring-inset" : ""}`}>
                    <div className={`text-xs font-semibold mb-1 ${isToday ? "text-yellow-400" : "text-gray-500"}`}>{day}</div>
                    <div className="space-y-1">
                      {dayPosts.slice(0, 4).map((post) => (
                        <button key={post._id} onClick={() => setShowDetail(post)} className="w-full text-left">
                          <div className="text-[10px] px-1.5 py-0.5 rounded truncate border-l-2" style={{ borderColor: post.project?.color || "#666" }}>
                            <span className="text-gray-500">{post.scheduledTime}</span>{" "}
                            <span className="text-gray-300">{post.title.slice(0, 25)}</span>
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
                      <span className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[post.status]}`}>{STATUS_LABELS[post.status]}</span>
                      <button onClick={(e) => { e.stopPropagation(); copyCaption(post.caption, post._id); }} className="text-gray-500 hover:text-yellow-400" title="Copiar legenda">
                        {copied === post._id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              {posts.length === 0 && (
                <div className="text-center py-20 text-gray-600">
                  <CalendarIcon size={48} className="mx-auto mb-4 opacity-30" />
                  <p>Nenhum post nesse periodo</p>
                  <button onClick={() => { setEditingPost(null); setShowModal(true); }} className="mt-4 text-yellow-400 text-sm hover:underline">Criar primeiro post</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Post Detail Modal */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowDetail(null)}>
          <div className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">{showDetail.project?.icon}</span>
                <span className="text-sm text-gray-400">{showDetail.project?.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setEditingPost(showDetail); setShowDetail(null); setShowModal(true); }} className="p-1.5 hover:bg-gray-800 rounded text-gray-400"><Pencil size={16} /></button>
                <button onClick={() => handleDelete(showDetail._id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400"><Trash2 size={16} /></button>
                <button onClick={() => setShowDetail(null)} className="p-1.5 hover:bg-gray-800 rounded"><X size={16} /></button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              <h3 className="text-lg font-bold text-white">{showDetail.title}</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs px-2 py-1 rounded border ${FORMAT_COLORS[showDetail.format]}`}>{showDetail.format.toUpperCase()}</span>
                <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[showDetail.status]}`}>{STATUS_LABELS[showDetail.status]}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock size={12} />
                  {new Date(showDetail.scheduledDate).toLocaleDateString("pt-BR")} as {showDetail.scheduledTime}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {(["draft", "approved", "scheduled", "posted"] as const).map((s) => (
                  <button key={s} onClick={() => handleStatusChange(showDetail._id, s)}
                    className={`text-xs px-3 py-1 rounded border transition ${showDetail.status === s ? "border-yellow-500 text-yellow-400" : "border-gray-700 text-gray-500 hover:border-gray-500"}`}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              {showDetail.content && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Texto do Reel</div>
                  <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-100 border-l-2 border-yellow-500">{showDetail.content}</div>
                </div>
              )}
              {showDetail.productionNotes && (
                <div>
                  <div className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Notas de Producao</div>
                  <div className="text-sm text-gray-400">{showDetail.productionNotes}</div>
                </div>
              )}
              {showDetail.caption && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Legenda</div>
                    <button onClick={() => copyCaption(showDetail.caption, showDetail._id)} className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1">
                      {copied === showDetail._id ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar</>}
                    </button>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-3 text-sm text-gray-100 whitespace-pre-wrap">{showDetail.caption}</div>
                </div>
              )}
              {showDetail.platforms.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Redes:</span>
                  {showDetail.platforms.map((p) => (
                    <span key={p} className="text-gray-400 flex items-center gap-1 text-xs">{PLATFORM_ICONS[p]} {p}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Post Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setShowModal(false); setEditingPost(null); }}>
          <div className="bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="font-bold">{editingPost ? "Editar Post" : "Novo Post"}</h3>
              <button onClick={() => { setShowModal(false); setEditingPost(null); }} className="p-1 hover:bg-gray-800 rounded"><X size={16} /></button>
            </div>
            <form onSubmit={handleSavePost} className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-400">Projeto</label>
                <select name="project" defaultValue={editingPost?.project?._id || ""} required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100">
                  <option value="">Selecione...</option>
                  {projects.map((p) => <option key={p._id} value={p._id}>{p.icon} {p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400">Titulo</label>
                <input name="title" defaultValue={editingPost?.title || ""} required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Formato</label>
                  <select name="format" defaultValue={editingPost?.format || "reel"} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100">
                    <option value="reel">Reel</option>
                    <option value="story">Story</option>
                    <option value="post">Post</option>
                    <option value="carrossel">Carrossel</option>
                    <option value="shorts">Shorts</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400">Status</label>
                  <select name="status" defaultValue={editingPost?.status || "draft"} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Data</label>
                  <input type="date" name="scheduledDate" defaultValue={editingPost?.scheduledDate?.split("T")[0] || ""} required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Horario</label>
                  <input type="time" name="scheduledTime" defaultValue={editingPost?.scheduledTime || "09:00"} required className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Redes Sociais</label>
                <div className="flex gap-3 mt-1 flex-wrap">
                  {["instagram", "tiktok", "youtube", "facebook", "twitter"].map((p) => (
                    <label key={p} className="flex items-center gap-1 text-xs text-gray-400">
                      <input type="checkbox" name="platforms" value={p} defaultChecked={editingPost?.platforms?.includes(p)} className="rounded bg-gray-800 border-gray-700" />
                      {p}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400">Texto do Conteudo</label>
                <textarea name="content" rows={2} defaultValue={editingPost?.content || ""} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Legenda</label>
                <textarea name="caption" rows={4} defaultValue={editingPost?.caption || ""} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Notas de Producao</label>
                <textarea name="productionNotes" rows={2} defaultValue={editingPost?.productionNotes || ""} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
              </div>
              <div>
                <label className="text-xs text-gray-400">CTA</label>
                <input name="cta" defaultValue={editingPost?.cta || ""} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" />
              </div>
              <div>
                <label className="text-xs text-gray-400">Hashtags (separadas por espaco)</label>
                <input name="hashtags" defaultValue={editingPost?.hashtags?.join(" ") || ""} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" placeholder="#HoraDeMudarOJogo #Mindset" />
              </div>
              <button type="submit" className="w-full bg-yellow-500 text-black font-bold py-2.5 rounded-lg hover:bg-yellow-400 transition">
                {editingPost ? "Salvar Alteracoes" : "Criar Post"}
              </button>
            </form>
          </div>
        </div>
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
                <label className="text-xs text-gray-400">Descricao</label>
                <input name="description" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100" placeholder="Perfil motivacional no Instagram" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400">Cor</label>
                  <input type="color" name="color" defaultValue="#f5c518" className="w-full h-10 bg-gray-800 border border-gray-700 rounded-lg mt-1 cursor-pointer" />
                </div>
                <div>
                  <label className="text-xs text-gray-400">Icone (emoji)</label>
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
              <button type="submit" className="w-full bg-yellow-500 text-black font-bold py-2.5 rounded-lg hover:bg-yellow-400 transition">
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
                <Plug size={20} className="text-yellow-400" />
                <h3 className="font-bold text-white">Configuracoes de Redes Sociais</h3>
              </div>
              <button onClick={() => { setShowSettings(false); setEditingAccount(null); setEditingApi(null); }} className="p-1 hover:bg-gray-800 rounded"><X size={16} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
              <button
                onClick={() => setSettingsTab("social")}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${settingsTab === "social" ? "text-yellow-400 border-b-2 border-yellow-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                <Plug size={14} className="inline mr-1.5" /> Redes Sociais
              </button>
              <button
                onClick={() => { setSettingsTab("apis"); loadApiCredentials(); }}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${settingsTab === "apis" ? "text-yellow-400 border-b-2 border-yellow-400" : "text-gray-500 hover:text-gray-300"}`}
              >
                🔧 APIs de Producao
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
                  className="flex items-center gap-1 text-xs bg-yellow-500 text-black px-3 py-1.5 rounded-lg font-semibold hover:bg-yellow-400 transition"
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
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-300">{PLATFORM_ICONS[acc.platform]}</span>
                      <div>
                        <div className="text-sm font-semibold text-gray-200">{acc.accountName}</div>
                        <div className="text-xs text-gray-500">{PLATFORM_FIELDS[acc.platform]?.label || acc.platform}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                  {acc.accountId && <div className="text-xs text-gray-600 mt-1">ID: {acc.accountId}</div>}
                  {acc.tokenExpiresAt && (
                    <div className="text-xs text-gray-600 mt-1">
                      Token expira: {new Date(acc.tokenExpiresAt).toLocaleDateString("pt-BR")}
                    </div>
                  )}
                </div>
              ))}

              {editingAccount && (
                <div className="bg-gray-800/50 rounded-xl p-4 border border-yellow-500/30">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-3">
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
                            placeholder={field.label}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="flex-1 bg-yellow-500 text-black font-bold py-2 rounded-lg hover:bg-yellow-400 transition text-sm">
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
                  <span className="text-sm font-semibold text-gray-300">APIs de Producao de Video</span>
                  <p className="text-xs text-gray-600 mt-0.5">Credenciais para geracao de roteiros, audio, imagens e corte de video</p>
                </div>
                {!editingApi && (
                  <button
                    onClick={() => { setEditingApi("new"); setFormApiService(""); }}
                    className="flex items-center gap-1 text-xs bg-yellow-500 text-black px-3 py-1.5 rounded-lg font-semibold hover:bg-yellow-400 transition"
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
                        {Object.keys(api.credentials || {}).length} campo(s) configurado(s)
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
                <div className="bg-gray-800/50 rounded-xl p-4 border border-yellow-500/30">
                  <h4 className="text-sm font-semibold text-yellow-400 mb-3">
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
                            placeholder={field.label}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm mt-1 text-gray-100"
                          />
                        </div>
                      ))}
                    </div>
                    )}
                    <div className="flex gap-2 pt-2">
                      <button type="submit" className="flex-1 bg-yellow-500 text-black font-bold py-2 rounded-lg hover:bg-yellow-400 transition text-sm">
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
  );
}
