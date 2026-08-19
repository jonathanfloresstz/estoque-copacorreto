import { supabase } from "./supabaseClient";

/* ------------------------------ Mapeamento DB <-> App ------------------------------ */

function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    createdAt: row.created_at,
  };
}

function mapMovement(row) {
  return {
    id: row.id,
    itemId: row.item_id,
    type: row.type,
    quantity: Number(row.quantity),
    note: row.note || "",
    source: row.source || "manual",
    date: row.date,
  };
}

/* ------------------------------ Leitura ------------------------------ */

export async function fetchItems() {
  const { data, error } = await supabase.from("items").select("*").order("name");
  if (error) throw error;
  return data.map(mapItem);
}

export async function fetchMovements() {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return data.map(mapMovement);
}

/* ------------------------------ Itens ------------------------------ */

export async function insertItem(item) {
  const { data, error } = await supabase
    .from("items")
    .insert({
      name: item.name,
      category: item.category,
      unit: item.unit,
      current_stock: item.currentStock ?? 0,
      min_stock: item.minStock ?? 1,
    })
    .select()
    .single();
  if (error) throw error;
  return mapItem(data);
}

export async function deleteItemById(id) {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

export async function updateItemStock(id, currentStock) {
  const { data, error } = await supabase
    .from("items")
    .update({ current_stock: currentStock })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapItem(data);
}

/* ------------------------------ Movimentações ------------------------------ */

export async function insertMovement(mov) {
  const { data, error } = await supabase
    .from("movements")
    .insert({
      item_id: mov.itemId,
      type: mov.type,
      quantity: mov.quantity,
      note: mov.note || "",
      source: mov.source || "manual",
    })
    .select()
    .single();
  if (error) throw error;
  return mapMovement(data);
}

/* ------------------------------ Manutenção ------------------------------ */

export async function clearAllData() {
  // apaga movimentações primeiro por causa da chave estrangeira
  const { error: e1 } = await supabase.from("movements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (e1) throw e1;
  const { error: e2 } = await supabase.from("items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (e2) throw e2;
}

/* ------------------------------ Tempo real ------------------------------ */
// Mantém todos os membros da equipe sincronizados automaticamente: quando
// alguém registra uma entrada/saída ou cadastra um item, os outros veem
// a atualização sem precisar recarregar a página.

export function subscribeToChanges(onChange) {
  const channel = supabase
    .channel("estoque-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "movements" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
