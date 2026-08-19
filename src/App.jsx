import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Package, AlertTriangle, TrendingDown, MessageSquare, FileText, Plus, Minus,
  Trash2, Send, Sparkles, Boxes, ClipboardList, Loader2, Check, X, ImagePlus,
  ClipboardPaste, LayoutGrid, ArrowUpRight, ArrowDownRight, RefreshCw
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

/* ---------------------------------------------------------------
   Estoque — Copa & Limpeza
   Paleta: concreto/papel frio + tinta carimbada (âmbar / ferrugem / verde-almoxarifado)
--------------------------------------------------------------- */

const COLORS = {
  ink: "#1F2A37",
  paper: "#EBEAE4",
  card: "#F6F5F1",
  amber: "#C9971E",
  teal: "#2F6F62",
  rust: "#B3462F",
  line: "#D9D6CC",
  white: "#FFFFFF",
};

const CATEGORIES = ["Copa", "Limpeza"];
const UNITS = ["un", "pacote", "rolo", "litro", "galão", "kg", "caixa", "fardo"];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
const fmtDateTime = (iso) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function seedItems() {
  const rows = [
    ["Café", "Copa", "pacote", 8, 5],
    ["Açúcar", "Copa", "pacote", 3, 5],
    ["Filtro de café", "Copa", "pacote", 12, 4],
    ["Copo descartável 200ml", "Copa", "pacote", 6, 8],
    ["Água mineral 20L", "Copa", "galão", 4, 3],
    ["Leite", "Copa", "litro", 10, 6],
    ["Adoçante", "Copa", "un", 15, 5],
    ["Guardanapo", "Copa", "pacote", 7, 4],
    ["Papel higiênico", "Limpeza", "fardo", 5, 6],
    ["Papel toalha", "Limpeza", "pacote", 9, 5],
    ["Detergente", "Limpeza", "un", 14, 6],
    ["Álcool em gel 500ml", "Limpeza", "un", 3, 5],
    ["Sabonete líquido", "Limpeza", "un", 8, 4],
    ["Desinfetante", "Limpeza", "un", 11, 5],
    ["Saco de lixo 100L", "Limpeza", "pacote", 6, 4],
    ["Pano multiuso", "Limpeza", "pacote", 10, 4],
  ];
  return rows.map(([name, category, unit, currentStock, minStock]) => ({
    id: uid(), name, category, unit, currentStock, minStock, createdAt: daysAgo(30),
  }));
}

function seedMovements(items) {
  const find = (name) => items.find((i) => i.name === name)?.id;
  const raw = [
    ["Café", "saida", 2, 26], ["Café", "saida", 2, 19], ["Café", "saida", 3, 11], ["Café", "entrada", 6, 6],
    ["Açúcar", "saida", 2, 24], ["Açúcar", "saida", 2, 15], ["Açúcar", "saida", 1, 5],
    ["Copo descartável 200ml", "saida", 3, 20], ["Copo descartável 200ml", "saida", 4, 9], ["Copo descartável 200ml", "saida", 2, 2],
    ["Leite", "saida", 3, 22], ["Leite", "saida", 4, 12], ["Leite", "entrada", 8, 8],
    ["Papel higiênico", "saida", 2, 21], ["Papel higiênico", "saida", 2, 14], ["Papel higiênico", "saida", 3, 4],
    ["Álcool em gel 500ml", "saida", 2, 23], ["Álcool em gel 500ml", "saida", 3, 10], ["Álcool em gel 500ml", "saida", 1, 3],
    ["Detergente", "saida", 2, 18], ["Detergente", "saida", 1, 7],
    ["Desinfetante", "saida", 2, 16], ["Desinfetante", "saida", 2, 6],
    ["Saco de lixo 100L", "saida", 3, 17], ["Saco de lixo 100L", "saida", 2, 5],
    ["Pano multiuso", "saida", 1, 13], ["Pano multiuso", "entrada", 6, 9],
  ];
  return raw.map(([name, type, quantity, days]) => ({
    id: uid(), itemId: find(name), type, quantity, date: daysAgo(days), note: "", source: "manual",
  })).filter((m) => m.itemId);
}

/* ------------------------- Camada de Persistência ------------------------- */

const Storage = {
  get: async (key) => {
    try {
      if (typeof window.storage !== "undefined" && window.storage.get) {
        const res = await window.storage.get(key, true);
        return res ? JSON.parse(res.value) : null;
      }
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : null;
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    try {
      if (typeof window.storage !== "undefined" && window.storage.set) {
        await window.storage.set(key, JSON.stringify(value), true);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("Erro ao salvar dados localmente", e);
    }
  }
};

/* ------------------------- Helper do Google Gemini ------------------------- */

const GEMINI_API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) ||
  (typeof process !== "undefined" && process.env && process.env.GEMINI_API_KEY) ||
  "";

async function callGemini({ system, contents, mimeType, base64Data }) {
  const cleanKey = GEMINI_API_KEY.trim();
  if (!cleanKey) {
    throw new Error("Chave de API do Gemini não configurada.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${cleanKey}`;

  const parts = [];

  if (base64Data && mimeType) {
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data,
      },
    });
  }

  if (typeof contents === "string") {
    parts.push({ text: contents });
  } else if (Array.isArray(contents)) {
    contents.forEach((c) => {
      if (typeof c === "string") parts.push({ text: c });
      else if (c.text) parts.push({ text: c.text });
    });
  }

  const payload = {
    contents: [{ parts }],
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cleanKey,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Erro API Gemini (${response.status})`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

function parseJSON(text) {
  try {
    const clean = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Falha ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

/* ------------------------------ UI atoms ------------------------------ */

function TagHole() {
  return (
    <div
      style={{
        position: "absolute", top: -7, left: 18, width: 14, height: 14,
        borderRadius: "50%", background: COLORS.paper, border: `2px solid ${COLORS.line}`,
      }}
    />
  );
}

function StatusOf(item) {
  if (item.currentStock <= item.minStock * 0.5) return { label: "crítico", color: COLORS.rust };
  if (item.currentStock <= item.minStock) return { label: "baixo", color: COLORS.amber };
  return { label: "ok", color: COLORS.teal };
}

function Gauge({ current, min, color }) {
  const max = Math.max(current, min * 2, 1);
  const pct = Math.min(100, (current / max) * 100);
  const minPct = Math.min(100, (min / max) * 100);
  return (
    <div style={{ position: "relative", height: 8, borderRadius: 999, background: COLORS.line, width: "100%" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, borderRadius: 999, transition: "width .3s" }} />
      <div style={{ position: "absolute", left: `${minPct}%`, top: -3, bottom: -3, width: 2, background: COLORS.ink, opacity: 0.55 }} title="mínimo" />
    </div>
  );
}

function Badge({ children, color, bg }) {
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 0.4, textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 999, color: color || COLORS.ink, background: bg || COLORS.line,
      fontWeight: 600,
    }}>
      {children}
    </span>
  );
}

function Btn({ children, onClick, variant = "primary", disabled, style, type = "button" }) {
  const base = {
    fontFamily: "'IBM Plex Sans', sans-serif", fontWeight: 600, fontSize: 13.5,
    padding: "8px 14px", borderRadius: 8, border: "none", cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex", alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1, transition: "transform .1s",
  };
  const variants = {
    primary: { background: COLORS.ink, color: COLORS.white },
    accent: { background: COLORS.amber, color: COLORS.ink },
    ghost: { background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.line}` },
    danger: { background: "transparent", color: COLORS.rust, border: `1px solid ${COLORS.rust}55` },
    teal: { background: COLORS.teal, color: COLORS.white },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Card({ children, style, className }) {
  return (
    <div className={className} style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 12, padding: 16, position: "relative", ...style }}>
      {children}
    </div>
  );
}

/* ------------------------------ App Principal ------------------------------ */

export default function App() {
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("painel");
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  useEffect(() => {
    (async () => {
      const data = await Storage.get("estoque-data");
      if (data && Array.isArray(data.items)) {
        setItems(data.items);
        setMovements(data.movements || []);
      } else {
        const its = seedItems();
        const movs = seedMovements(its);
        setItems(its);
        setMovements(movs);
        await Storage.set("estoque-data", { items: its, movements: movs });
      }
      setReady(true);
    })();
  }, []);

  const persist = useCallback(async (nextItems, nextMovements) => {
    await Storage.set("estoque-data", { items: nextItems, movements: nextMovements });
  }, []);

  const addItem = (item) => {
    if (!item.name || !item.name.trim()) {
      showToast("O nome do item é obrigatório.");
      return;
    }
    const exists = items.some((i) => i.name.toLowerCase() === item.name.toLowerCase());
    if (exists) {
      showToast(`O item "${item.name}" já está cadastrado.`);
      return;
    }
    const newItem = { ...item, id: uid(), createdAt: new Date().toISOString() };
    const next = [...items, newItem];
    setItems(next);
    persist(next, movements);
    showToast(`"${item.name}" adicionado ao estoque.`);
    return newItem;
  };

  const removeItem = (id) => {
    const item = items.find((i) => i.id === id);
    const next = items.filter((i) => i.id !== id);
    const nextMovs = movements.filter((m) => m.itemId !== id);
    setItems(next);
    setMovements(nextMovs);
    persist(next, nextMovs);
    showToast(`"${item?.name || 'Item'}" removido.`);
  };

  const clearDemoData = () => {
    if (window.confirm("Deseja realmente limpar todos os dados do estoque e histórico?")) {
      setItems([]);
      setMovements([]);
      persist([], []);
      showToast("Todos os dados do estoque foram limpos.");
    }
  };

  const addMovement = (itemId, type, quantity, note = "", source = "manual") => {
    const q = Number(quantity);
    if (!itemId || isNaN(q) || q <= 0) {
      showToast("Quantidade ou item inválido.");
      return null;
    }

    const item = items.find((i) => i.id === itemId);
    if (!item) {
      showToast("Item não encontrado.");
      return null;
    }

    if (type === "saida" && item.currentStock < q) {
      showToast(`Estoque insuficiente! Saldo atual de ${item.name}: ${item.currentStock} ${item.unit}.`);
      return null;
    }

    const delta = type === "entrada" ? q : -q;
    const nextItems = items.map((i) => i.id === itemId ? { ...i, currentStock: Math.max(0, i.currentStock + delta) } : i);
    const mov = { id: uid(), itemId, type, quantity: q, date: new Date().toISOString(), note, source };
    const nextMovs = [mov, ...movements];

    setItems(nextItems);
    setMovements(nextMovs);
    persist(nextItems, nextMovs);
    showToast(`${type === "entrada" ? "Entrada" : "Saída"} de ${q} ${item.unit} — ${item.name}`);
    return mov;
  };

  const weeklyConsumption = (itemId) => {
    const cutoff = Date.now() - 28 * 86400000;
    const total = movements.filter((m) => m.itemId === itemId && m.type === "saida" && new Date(m.date).getTime() >= cutoff)
      .reduce((s, m) => s + m.quantity, 0);
    return total / 4;
  };

  const daysRemaining = (item) => {
    const wk = weeklyConsumption(item.id);
    if (wk <= 0) return null;
    return Math.round((item.currentStock / wk) * 7);
  };

  const lowStock = items.filter((i) => i.currentStock <= i.minStock).sort((a, b) => (a.currentStock / (a.minStock || 1)) - (b.currentStock / (b.minStock || 1)));

  if (!ready) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: COLORS.ink, fontFamily: "'IBM Plex Sans', sans-serif" }}>
        <Loader2 className="animate-spin" size={20} style={{ marginRight: 8 }} /> Carregando estoque…
      </div>
    );
  }

  const TABS = [
    { id: "painel", label: "Painel", icon: LayoutGrid },
    { id: "estoque", label: "Estoque", icon: Boxes },
    { id: "mov", label: "Movimentações", icon: ClipboardList },
    { id: "chat", label: "Assistente IA", icon: MessageSquare },
    { id: "notas", label: "Notas Fiscais", icon: FileText },
  ];

  return (
    <div style={{
      fontFamily: "'IBM Plex Sans', sans-serif", background: COLORS.paper, color: COLORS.ink,
      minHeight: 600, borderRadius: 16, overflow: "hidden", border: `1px solid ${COLORS.line}`,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        input, select, textarea { font-family: 'IBM Plex Sans', sans-serif; }
        ::placeholder { color: #9B9789; }
        .tab-btn:hover { background: #ffffff88; }
        .item-card:hover { transform: translateY(-2px); }
        @media (max-width: 768px) {
          .mobile-stack { flex-direction: column !important; }
          .mobile-full { width: 100% !important; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: COLORS.ink, color: COLORS.paper, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: COLORS.amber, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Package size={18} color={COLORS.ink} />
          </div>
          <div>
            <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 19, letterSpacing: 0.5, textTransform: "uppercase" }}>Estoque — Copa &amp; Limpeza</div>
            <div style={{ fontSize: 11.5, opacity: 0.65, fontFamily: "'IBM Plex Mono', monospace" }}>almoxarifado digital · inteligência com gemini</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <nav style={{ display: "flex", gap: 4, background: "#ffffff14", padding: 4, borderRadius: 10, flexWrap: "wrap" }}>
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} className="tab-btn" onClick={() => setTab(t.id)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 7, border: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif",
                  background: active ? COLORS.amber : "transparent", color: active ? COLORS.ink : COLORS.paper,
                }}>
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </nav>
          <button onClick={clearDemoData} title="Limpar dados do estoque" style={{ background: "transparent", border: `1px solid ${COLORS.line}44`, color: COLORS.paper, padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
            <RefreshCw size={12} /> Limpar
          </button>
        </div>
      </div>

      <div style={{ padding: 24 }}>
        {tab === "painel" && (
          <PainelTab items={items} lowStock={lowStock} movements={movements} weeklyConsumption={weeklyConsumption} daysRemaining={daysRemaining} addMovement={addMovement} showToast={showToast} />
        )}
        {tab === "estoque" && (
          <EstoqueTab items={items} addItem={addItem} removeItem={removeItem} addMovement={addMovement} daysRemaining={daysRemaining} />
        )}
        {tab === "mov" && (
          <MovimentacoesTab items={items} movements={movements} addMovement={addMovement} />
        )}
        {tab === "chat" && (
          <ChatTab items={items} addItem={addItem} addMovement={addMovement} showToast={showToast} />
        )}
        {tab === "notas" && (
          <NotasTab items={items} addItem={addItem} addMovement={addMovement} showToast={showToast} />
        )}
      </div>

      {toast && (
        <div style={{
          position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
          background: COLORS.ink, color: COLORS.paper, padding: "10px 18px", borderRadius: 999,
          fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px #0004", zIndex: 50, border: `1px solid ${COLORS.amber}`
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ Painel (Dashboard) ------------------------------ */

function PainelTab({ items, lowStock, movements, weeklyConsumption, daysRemaining, addMovement, showToast }) {
  const [insight, setInsight] = useState("");
  const [loadingInsight, setLoadingInsight] = useState(false);

  const weekAgo = Date.now() - 7 * 86400000;
  const movsThisWeek = movements.filter((m) => new Date(m.date).getTime() >= weekAgo).length;

  const chartData = items.map((i) => ({
    name: i.name.length > 14 ? i.name.slice(0, 13) + "…" : i.name,
    Estoque: i.currentStock, Mínimo: i.minStock,
    status: StatusOf(i).color,
  }));

  const genInsight = async () => {
    if (items.length === 0) {
      showToast("Cadastre itens no estoque antes de gerar uma análise.");
      return;
    }
    setLoadingInsight(true);
    const summary = items.map((i) => {
      const wk = weeklyConsumption(i.id);
      const dr = daysRemaining(i);
      return `${i.name} (${i.category}): estoque ${i.currentStock}${i.unit}, mínimo ${i.minStock}${i.unit}, consumo semanal ~${wk.toFixed(1)}, dias restantes ${dr ?? "sem histórico"}`;
    }).join("\n");

    try {
      const text = await callGemini({
        system: "Você é um assistente de gestão de estoque de copa e limpeza para uma pequena empresa. Responda em português do Brasil, de forma direta e prática, em no máximo 6 linhas com bullets curtos. Aponte prioridades de reposição e qualquer risco de ruptura de estoque nos próximos 7-10 dias. Não use markdown de títulos, apenas texto simples com traços '-' para bullets.",
        contents: `Dados atuais do estoque real:\n${summary}\n\nGere uma análise curta com recomendações de reposição baseadas nestes dados reais.`,
      });
      setInsight(text.trim());
    } catch (err) {
      showToast(err.message || "Erro ao conectar com o Gemini.");
      setInsight(`Não foi possível gerar a análise. (${err.message})`);
    }
    setLoadingInsight(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <KPI icon={Boxes} label="Itens cadastrados" value={items.length} color={COLORS.ink} />
        <KPI icon={AlertTriangle} label="Itens em alerta" value={lowStock.length} color={COLORS.rust} />
        <KPI icon={ClipboardList} label="Movimentações (7d)" value={movsThisWeek} color={COLORS.teal} />
        <KPI icon={TrendingDown} label="Crítico (≤50% do mín.)" value={items.filter(i => i.currentStock <= i.minStock * 0.5).length} color={COLORS.amber} />
      </div>

      {lowStock.length > 0 && (
        <Card>
          <SectionTitle icon={AlertTriangle} color={COLORS.rust}>Alerta de reposição</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {lowStock.map((i) => {
              const st = StatusOf(i); const dr = daysRemaining(i);
              return (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", background: COLORS.paper, borderRadius: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "0 0 160px", fontWeight: 600, fontSize: 13.5 }}>{i.name}</div>
                  <div style={{ flex: 1, minWidth: 80 }}><Gauge current={i.currentStock} min={i.minStock} color={st.color} /></div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, width: 90, textAlign: "right" }}>{i.currentStock}/{i.minStock} {i.unit}</div>
                  <div style={{ width: 110, fontSize: 12, color: st.color, fontWeight: 600 }}>{dr != null ? `~${dr} dias restantes` : "sem histórico"}</div>
                  <Btn variant="teal" onClick={() => addMovement(i.id, "entrada", i.minStock, "reposição rápida", "manual")}>
                    <Plus size={14} /> Repor {i.minStock}
                  </Btn>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }} className="mobile-stack">
        <Card>
          <SectionTitle icon={Boxes} color={COLORS.ink}>Estoque atual vs. mínimo</SectionTitle>
          <div style={{ height: 300, marginTop: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono" }} interval={0} angle={-35} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontFamily: "IBM Plex Sans", fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="Estoque" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, idx) => <Cell key={idx} fill={d.status} />)}
                </Bar>
                <Bar dataKey="Mínimo" fill={COLORS.line} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle icon={Sparkles} color={COLORS.amber}>Análise com Gemini IA</SectionTitle>
          <p style={{ fontSize: 12.5, opacity: 0.7, margin: "6px 0 12px" }}>Gere um resumo com prioridades de reposição com base no consumo real armazenado.</p>
          <Btn variant="accent" onClick={genInsight} disabled={loadingInsight}>
            {loadingInsight ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loadingInsight ? "Analisando..." : "Gerar análise Gemini"}
          </Btn>
          {insight && (
            <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", background: COLORS.paper, padding: 12, borderRadius: 8 }}>
              {insight}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }) {
  return (
    <Card style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <TagHole />
      <div style={{ width: 38, height: 38, borderRadius: 8, background: `${color}1A`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 11.5, opacity: 0.65 }}>{label}</div>
      </div>
    </Card>
  );
}

function SectionTitle({ icon: Icon, color, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 15, textTransform: "uppercase", letterSpacing: 0.3 }}>
      <Icon size={16} color={color} /> {children}
    </div>
  );
}

/* ------------------------------ Estoque ------------------------------ */

function EstoqueTab({ items, addItem, removeItem, addMovement, daysRemaining }) {
  const [filter, setFilter] = useState("Todos");
  const [showForm, setShowForm] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ name: "", category: "Copa", unit: "un", currentStock: 0, minStock: 1 });

  const filtered = filter === "Todos" ? items : items.filter((i) => i.category === filter);

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    addItem({ ...form, currentStock: Number(form.currentStock) || 0, minStock: Number(form.minStock) || 1 });
    setForm({ name: "", category: "Copa", unit: "un", currentStock: 0, minStock: 1 });
    setShowForm(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {["Todos", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setFilter(c)} style={{
              padding: "6px 14px", borderRadius: 999, border: `1px solid ${COLORS.line}`, cursor: "pointer",
              background: filter === c ? COLORS.ink : COLORS.card, color: filter === c ? COLORS.white : COLORS.ink,
              fontSize: 12.5, fontWeight: 600,
            }}>{c}</button>
          ))}
        </div>
        <Btn variant="accent" onClick={() => setShowForm((s) => !s)}><Plus size={14} /> Novo item</Btn>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }} className="mobile-stack">
            <Field label="Nome">
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle} placeholder="Ex.: Papel toalha" />
            </Field>
            <Field label="Categoria">
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} style={inputStyle}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Unidade">
              <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} style={inputStyle}>
                {UNITS.map((u) => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Estoque">
              <input type="number" min="0" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Mínimo">
              <input type="number" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} style={inputStyle} />
            </Field>
            <Btn type="submit" variant="primary">Adicionar</Btn>
          </form>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14 }}>
        {filtered.map((i) => {
          const st = StatusOf(i);
          const dr = daysRemaining(i);
          return (
            <Card key={i.id} className="item-card" style={{ transition: "transform .15s" }}>
              <TagHole />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <Badge bg={i.category === "Copa" ? "#2F6F621A" : "#B3462F1A"} color={i.category === "Copa" ? COLORS.teal : COLORS.rust}>{i.category}</Badge>
                <button onClick={() => setConfirmDel(confirmDel === i.id ? null : i.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9B9789" }}>
                  <Trash2 size={14} />
                </button>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{i.name}</div>
              <div style={{ fontSize: 11.5, opacity: 0.6, marginBottom: 10, fontFamily: "'IBM Plex Mono', monospace" }}>
                {i.currentStock} {i.unit} · mín. {i.minStock}
              </div>
              <Gauge current={i.currentStock} min={i.minStock} color={st.color} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: st.color, textTransform: "uppercase" }}>{st.label}{dr != null ? ` · ~${dr}d` : ""}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <IconBtn onClick={() => addMovement(i.id, "saida", 1, "", "manual")}><Minus size={13} /></IconBtn>
                  <IconBtn onClick={() => addMovement(i.id, "entrada", 1, "", "manual")}><Plus size={13} /></IconBtn>
                </div>
              </div>
              {confirmDel === i.id && (
                <div style={{ marginTop: 10, display: "flex", gap: 6 }}>
                  <Btn variant="danger" onClick={() => { removeItem(i.id); setConfirmDel(null); }}>Excluir</Btn>
                  <Btn variant="ghost" onClick={() => setConfirmDel(null)}>Cancelar</Btn>
                </div>
              )}
            </Card>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "30px 0", fontSize: 13, opacity: 0.6 }}>
            Nenhum item cadastrado. Clique em "Novo item" para começar.
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 26, height: 26, borderRadius: 6, border: `1px solid ${COLORS.line}`, background: COLORS.paper,
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.ink,
    }}>{children}</button>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, fontWeight: 600, opacity: 0.75 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  padding: "8px 10px", borderRadius: 7, border: `1px solid ${COLORS.line}`, background: COLORS.white,
  fontSize: 13, color: COLORS.ink, outline: "none", width: "100%",
};

/* ------------------------------ Movimentações ------------------------------ */

function MovimentacoesTab({ items, movements, addMovement }) {
  const [form, setForm] = useState({ itemId: items[0]?.id || "", type: "saida", quantity: 1, note: "" });

  useEffect(() => {
    if (!form.itemId && items.length > 0) {
      setForm((f) => ({ ...f, itemId: items[0].id }));
    }
  }, [items]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.itemId) return;
    const res = addMovement(form.itemId, form.type, Number(form.quantity), form.note, "manual");
    if (res) setForm({ ...form, quantity: 1, note: "" });
  };

  const sorted = [...movements].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle icon={ClipboardList} color={COLORS.ink}>Registrar movimentação</SectionTitle>
        <form onSubmit={submit} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 2fr auto", gap: 10, marginTop: 12, alignItems: "end" }} className="mobile-stack">
          <Field label="Item">
            <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} style={inputStyle}>
              {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.currentStock} {i.unit})</option>)}
            </select>
          </Field>
          <Field label="Tipo">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} style={inputStyle}>
              <option value="saida">Saída</option>
              <option value="entrada">Entrada</option>
            </select>
          </Field>
          <Field label="Quantidade">
            <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Observação">
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={inputStyle} placeholder="opcional" />
          </Field>
          <Btn type="submit" variant="accent" disabled={!form.itemId || items.length === 0}>Registrar</Btn>
        </form>
      </Card>

      <Card>
        <SectionTitle icon={ClipboardList} color={COLORS.ink}>Histórico de Movimentações</SectionTitle>
        <div style={{ marginTop: 10, maxHeight: 420, overflowY: "auto", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 11, textTransform: "uppercase", opacity: 0.6 }}>
                <th style={{ padding: "6px 8px" }}>Data</th>
                <th style={{ padding: "6px 8px" }}>Item</th>
                <th style={{ padding: "6px 8px" }}>Tipo</th>
                <th style={{ padding: "6px 8px" }}>Qtd.</th>
                <th style={{ padding: "6px 8px" }}>Origem</th>
                <th style={{ padding: "6px 8px" }}>Obs.</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => {
                const item = items.find((i) => i.id === m.itemId);
                return (
                  <tr key={m.id} style={{ borderTop: `1px solid ${COLORS.line}` }}>
                    <td style={{ padding: "7px 8px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, whiteSpace: "nowrap" }}>{fmtDateTime(m.date)}</td>
                    <td style={{ padding: "7px 8px", fontWeight: 600 }}>{item?.name || "(Item Excluído)"}</td>
                    <td style={{ padding: "7px 8px" }}>
                      {m.type === "entrada"
                        ? <span style={{ color: COLORS.teal, display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}><ArrowUpRight size={13} />Entrada</span>
                        : <span style={{ color: COLORS.rust, display: "flex", alignItems: "center", gap: 3, fontWeight: 600 }}><ArrowDownRight size={13} />Saída</span>}
                    </td>
                    <td style={{ padding: "7px 8px", fontFamily: "'IBM Plex Mono', monospace" }}>{m.quantity} {item?.unit || "un"}</td>
                    <td style={{ padding: "7px 8px" }}><Badge>{m.source}</Badge></td>
                    <td style={{ padding: "7px 8px", opacity: 0.7 }}>{m.note}</td>
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={6} style={{ padding: "16px 8px", textAlign: "center", opacity: 0.6 }}>Nenhuma movimentação registrada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Chat / Assistente IA Gemini ------------------------------ */

function ChatTab({ items, addItem, addMovement, showToast }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: 'Oi! Me conte o que entrou ou saiu do estoque — por exemplo: "saiu 3 pacotes de café" ou "chegaram 2 fardos de papel higiênico".' },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const nextMsgs = [...messages, { role: "user", content: text }];
    setMessages(nextMsgs);
    setSending(true);

    const itemList = items.map((i) => `${i.id}::${i.name} (${i.unit})`).join("\n");
    const system = `Você é um assistente de estoque de copa e limpeza. Responda SEMPRE em JSON puro, sem formatação markdown ou crases, no seguinte formato exato:
{"reply": "resposta curta e simpática em português do Brasil", "action": null OU {"type": "entrada" ou "saida", "itemId": "id do item da lista ou null", "itemName": "nome dito pelo usuário", "quantity": numero, "unit": "unidade"}}

Lista de itens existentes atualmente no sistema (id::nome (unidade)):
${itemList || "Nenhum item cadastrado."}

Regras:
1. Tente casar o nome citado pelo usuário com um item da lista existente (mesmo com plural ou pequeno erro de digitação); se achar, preencha itemId com o ID exato.
2. Se não achar nenhum item idêntico na lista fornecida, deixe itemId como null e coloque o nome dito no itemName.
3. Se a mensagem não for sobre movimentação, coloque action como null.`;

    try {
      const raw = await callGemini({ system, contents: text });
      const parsed = parseJSON(raw) || { reply: raw, action: null };
      setMessages((cur) => [...cur, { role: "assistant", content: parsed.reply, action: parsed.action, confirmed: false }]);
    } catch (err) {
      showToast("Erro na comunicação com a API do Gemini.");
      setMessages((cur) => [...cur, { role: "assistant", content: `Não foi possível se conectar ao serviço do Gemini. (${err.message})` }]);
    }
    setSending(false);
  };

  const confirmAction = (idx) => {
    const msg = messages[idx];
    const a = msg.action;
    if (a.itemId) {
      const res = addMovement(a.itemId, a.type, a.quantity, "via assistente IA", "chat");
      if (res) {
        setMessages((cur) => cur.map((m, i) => i === idx ? { ...m, confirmed: true } : m));
      }
    }
  };

  const createFromAction = (idx) => {
    const msg = messages[idx];
    const a = msg.action;
    const created = addItem({ name: a.itemName, category: "Limpeza", unit: a.unit || "un", currentStock: 0, minStock: 1 });
    if (created) {
      setMessages((cur) => [...cur, { role: "assistant", content: `Criei "${a.itemName}" no estoque. Agora você pode confirmar a movimentação.` }]);
    }
  };

  return (
    <Card style={{ display: "flex", flexDirection: "column", height: 520 }}>
      <SectionTitle icon={MessageSquare} color={COLORS.amber}>Assistente de estoque (Gemini Flash)</SectionTitle>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "14px 4px" }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", background: m.role === "user" ? COLORS.ink : COLORS.paper,
              color: m.role === "user" ? COLORS.white : COLORS.ink, padding: "10px 13px", borderRadius: 12,
              fontSize: 13.5, lineHeight: 1.5,
            }}>
              {m.content}
              {m.action && m.action.type && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.line}` }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>
                    <Badge color={m.action.type === "entrada" ? COLORS.teal : COLORS.rust} bg={m.action.type === "entrada" ? "#2F6F621A" : "#B3462F1A"}>
                      {m.action.type}
                    </Badge>{" "}
                    {m.action.quantity} {m.action.unit} · {m.action.itemName}
                  </div>
                  {m.confirmed ? (
                    <span style={{ fontSize: 12, color: COLORS.teal, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}><Check size={13} /> Registrado</span>
                  ) : m.action.itemId ? (
                    <Btn variant="accent" onClick={() => confirmAction(idx)}><Check size={13} /> Confirmar alteração</Btn>
                  ) : (
                    <Btn variant="ghost" onClick={() => createFromAction(idx)}><Plus size={13} /> Criar item "{m.action.itemName}"</Btn>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <div style={{ fontSize: 12, opacity: 0.6, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={13} className="animate-spin" /> Processando com Gemini...</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.line}` }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ex.: saiu 2 pacotes de guardanapo do refeitório"
          style={{ ...inputStyle, flex: 1 }}
        />
        <Btn variant="primary" onClick={send} disabled={sending || !input.trim()}><Send size={14} /></Btn>
      </div>
    </Card>
  );
}

/* ------------------------------ Leitura de Notas Fiscais ------------------------------ */

function NotasTab({ items, addItem, addMovement, showToast }) {
  const [mode, setMode] = useState("imagem");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [pasted, setPasted] = useState("");
  const [loading, setLoading] = useState(false);
  const [extracted, setExtracted] = useState(null);

  const onFile = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const extractPrompt = "Extraia todos os itens de estoque (copa e limpeza) identificados, com nome, quantidade (número puro) e unidade de medida. Responda APENAS em JSON puro, sem formatação markdown ou crases, no formato de vetor: [{\"name\": \"...\", \"quantity\": 1, \"unit\": \"...\"}]. Se não identificar nenhum item válido de copa ou limpeza, retorne [].";

  const runExtractImage = async () => {
    if (!file) return;
    setLoading(true);
    try {
      const b64 = await fileToBase64(file);
      const raw = await callGemini({
        system: "Você lê imagens de notas fiscais e comprovantes de compras de copa e limpeza para controle de estoque.",
        contents: extractPrompt,
        mimeType: file.type || "image/jpeg",
        base64Data: b64,
      });
      const parsed = parseJSON(raw) || [];
      setExtracted(parsed.map((p) => ({ ...p, matchId: matchItem(p.name), include: true })));
      if (parsed.length === 0) showToast("Nenhum produto de copa/limpeza foi reconhecido na foto.");
    } catch (err) {
      showToast(err.message || "Erro ao processar imagem da nota com Gemini.");
      setExtracted([]);
    }
    setLoading(false);
  };

  const runExtractText = async () => {
    if (!pasted.trim()) return;
    setLoading(true);
    try {
      const raw = await callGemini({
        system: "Você interpreta texto de planilhas/notas fiscais de compras de copa e limpeza.",
        contents: `${extractPrompt}\n\nTexto para análise:\n${pasted}`,
      });
      const parsed = parseJSON(raw) || [];
      setExtracted(parsed.map((p) => ({ ...p, matchId: matchItem(p.name), include: true })));
      if (parsed.length === 0) showToast("Nenhum item válido identificado no texto.");
    } catch (err) {
      showToast(err.message || "Erro ao interpretar texto via Gemini.");
      setExtracted([]);
    }
    setLoading(false);
  };

  const matchItem = (name) => {
    const n = (name || "").toLowerCase();
    const found = items.find((i) => n.includes(i.name.toLowerCase()) || i.name.toLowerCase().includes(n));
    return found?.id || "";
  };

  const updateRow = (idx, patch) => setExtracted((cur) => cur.map((r, i) => i === idx ? { ...r, ...patch } : r));

  const applyAll = () => {
    if (!extracted) return;
    let count = 0;
    extracted.forEach((row) => {
      if (!row.include) return;
      let targetId = row.matchId;

      if (targetId === "__new__") {
        const created = addItem({ name: row.name, category: "Limpeza", unit: row.unit || "un", currentStock: 0, minStock: 1 });
        if (created) targetId = created.id;
      }

      if (targetId && targetId !== "__new__") {
        addMovement(targetId, "entrada", Number(row.quantity) || 1, "importação via Nota Fiscal", "nota");
        count++;
      }
    });

    showToast(`${count} entradas aplicadas com sucesso ao estoque.`);
    setExtracted(null); setFile(null); setPreview(null); setPasted("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => { setMode("imagem"); setExtracted(null); }} style={{
          padding: "6px 14px", borderRadius: 999, border: `1px solid ${COLORS.line}`, cursor: "pointer",
          background: mode === "imagem" ? COLORS.ink : COLORS.card, color: mode === "imagem" ? COLORS.white : COLORS.ink,
          fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}><ImagePlus size={14} /> Foto da nota</button>
        <button onClick={() => { setMode("texto"); setExtracted(null); }} style={{
          padding: "6px 14px", borderRadius: 999, border: `1px solid ${COLORS.line}`, cursor: "pointer",
          background: mode === "texto" ? COLORS.ink : COLORS.card, color: mode === "texto" ? COLORS.white : COLORS.ink,
          fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        }}><ClipboardPaste size={14} /> Colar lista/planilha</button>
      </div>

      <Card>
        {mode === "imagem" ? (
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <input type="file" accept="image/*" onChange={onFile} style={{ fontSize: 13 }} />
              {preview && <img src={preview} alt="preview" style={{ marginTop: 10, maxWidth: 220, borderRadius: 8, border: `1px solid ${COLORS.line}` }} />}
            </div>
            <Btn variant="accent" onClick={runExtractImage} disabled={!file || loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Extrair itens com Gemini
            </Btn>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6}
              placeholder="Cole aqui o texto da nota fiscal ou da planilha (ex.: 5 fardos papel toalha, 10L leite)"
              style={{ ...inputStyle, resize: "vertical" }} />
            <Btn variant="accent" onClick={runExtractText} disabled={!pasted.trim() || loading} style={{ alignSelf: "flex-start" }}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Extrair itens com Gemini
            </Btn>
          </div>
        )}
      </Card>

      {extracted && (
        <Card>
          <SectionTitle icon={FileText} color={COLORS.ink}>Itens identificados (Conferência)</SectionTitle>
          {extracted.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>Nenhum item reconhecido. Verifique a imagem ou texto colado.</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                {extracted.map((row, idx) => (
                  <div key={idx} style={{ display: "grid", gridTemplateColumns: "auto 1.5fr 0.7fr 0.7fr 1.5fr", gap: 8, alignItems: "center", padding: "6px 8px", background: COLORS.paper, borderRadius: 8 }} className="mobile-stack">
                    <input type="checkbox" checked={row.include} onChange={(e) => updateRow(idx, { include: e.target.checked })} />
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</div>
                    <input type="number" value={row.quantity} onChange={(e) => updateRow(idx, { quantity: e.target.value })} style={{ ...inputStyle, padding: "5px 8px" }} />
                    <div style={{ fontSize: 12, fontFamily: "'IBM Plex Mono', monospace" }}>{row.unit}</div>
                    <select value={row.matchId} onChange={(e) => updateRow(idx, { matchId: e.target.value })} style={{ ...inputStyle, padding: "5px 8px" }}>
                      <option value="">— selecionar item —</option>
                      <option value="__new__">+ criar novo item</option>
                      {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <Btn variant="primary" onClick={applyAll}><Check size={14} /> Confirmar e dar entrada</Btn>
                <Btn variant="ghost" onClick={() => setExtracted(null)}><X size={14} /> Descartar</Btn>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
