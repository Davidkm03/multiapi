import { Database } from "bun:sqlite";

const db = new Database("database.sqlite");

// Inicializar tabla de KEYS
db.run(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    usage_count INTEGER DEFAULT 0
  )
`);

// Inicializar tabla de WORKFLOWS (Tu propio n8n)
db.run(`
    CREATE TABLE IF NOT EXISTS workflows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        steps_json TEXT NOT NULL, -- Guardaremos el array de pasos como JSON string
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

export interface ApiKey {
    id: number;
    key: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
    usage_count: number;
}

export const dbManager = {
    // --- API KEYS ---
    createKey: (name: string): ApiKey => {
        const key = `sk-multi-${crypto.randomUUID().split('-')[0]}${crypto.randomUUID().split('-')[1]}`;
        const query = db.query(`INSERT INTO api_keys (key, name) VALUES ($key, $name) RETURNING *`);
        return query.get({ $key: key, $name: name }) as ApiKey;
    },

    listKeys: (): ApiKey[] => {
        return db.query("SELECT * FROM api_keys ORDER BY created_at DESC").all() as ApiKey[];
    },

    deleteKey: (id: number) => {
        db.run("DELETE FROM api_keys WHERE id = ?", [id]);
    },

    validateAndTrack: (key: string): boolean => {
        const record = db.query("SELECT id FROM api_keys WHERE key = $key").get({ $key: key });
        if (record) {
            db.run("UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE key = ?", [key]);
            return true;
        }
        return false;
    },

    // --- WORKFLOWS ENGINE (DATABASE LEVEL) ---
    createWorkflow: (name: string, description: string, steps: any[]) => {
        const query = db.query('INSERT INTO workflows (name, description, steps_json) VALUES ($name, $desc, $steps) RETURNING id');
        return query.get({
            $name: name,
            $desc: description,
            $steps: JSON.stringify(steps)
        });
    },

    listWorkflows: () => {
        const rows = db.query('SELECT * FROM workflows ORDER BY created_at DESC').all();
        return rows.map((r: any) => ({
            ...r,
            steps: JSON.parse(r.steps_json)
        }));
    },

    getWorkflow: (id: number) => {
        const row = db.query('SELECT * FROM workflows WHERE id = ?').get(id) as any;
        if (!row) return null;
        return { ...row, steps: JSON.parse(row.steps_json) };
    }
};
