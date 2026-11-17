import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { partnerOf } from "./logic";
import { friendly, store } from "./store";
import { emptyTables, type Member, type TableName, type Tables } from "./types";

type Chez = {
  me: Member;
  partner: Member | null;
  members: Member[];
  t: Tables;
  now: Date;
  reload: () => Promise<void>;
  add: <K extends TableName>(table: K, row: Partial<Tables[K][number]>, ping?: [string, string]) => Promise<Tables[K][number]>;
  edit: <K extends TableName>(table: K, id: string, patch: Partial<Tables[K][number]>, ping?: [string, string]) => Promise<void>;
  remove: (table: TableName, id: string) => Promise<void>;
  setting: (key: string, value: string | null) => Promise<void>;
  get: (key: string) => string | null;
  /** The other one's name, as they're known in the house */
  them: string;
};

const Ctx = createContext<Chez | null>(null);

export function useChez() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChez outside the house");
  return c;
}

export function ChezProvider({ me, children }: { me: Member; children: ReactNode }) {
  const [members, setMembers] = useState<Member[]>([me]);
  const [t, setT] = useState<Tables>(emptyTables);
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [m, data] = await Promise.all([store.members(), store.load()]);
      setMembers(m);
      setT(data);
      setError(null);
    } catch (e) {
      setError(friendly(e));
    }
  }, []);

  useEffect(() => {
    reload();
    const off = store.onChange(reload);
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      off();
      clearInterval(tick);
    };
  }, [reload]);

  const value = useMemo<Chez>(() => {
    const partner = partnerOf(members, me.user_id);
    // Show the change straight away, then catch up with the server
    return {
      me,
      partner,
      members,
      t,
      now,
      reload,
      them: partner?.name ?? "them",
      async add(table, row, ping) {
        const saved = await store.add(table, row);
        setT((x) => ({ ...x, [table]: [...x[table], saved] }));
        if (ping) void store.notify(...ping);
        return saved;
      },
      async edit(table, id, patch, ping) {
        await store.edit(table, id, patch);
        setT((x) => ({ ...x, [table]: (x[table] as { id: string }[]).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
        if (ping) void store.notify(...ping);
      },
      async remove(table, id) {
        await store.remove(table, id);
        setT((x) => ({ ...x, [table]: (x[table] as { id: string }[]).filter((r) => r.id !== id) }));
      },
      async setting(key, v) {
        await store.setting(key, v);
        setT((x) => ({ ...x, settings: [...x.settings.filter((s) => s.key !== key), { key, value: v }] }));
      },
      get: (key) => t.settings.find((s) => s.key === key)?.value ?? null,
    };
  }, [me, members, t, now, reload]);

  return (
    <Ctx.Provider value={value}>
      {error && (
        <div className="net-error" role="alert">
          {error} <button onClick={reload}>Try again</button>
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
