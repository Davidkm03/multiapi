import { Database } from "bun:sqlite";

const db = new Database("database.sqlite");

// Inicializar tabla si no existe
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

export interface ApiKey {
    id: number;
    key: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
    usage_count: number;
}

export const dbManager = {
    // Crear una nueva llave
    createKey: (name: string): ApiKey => {
        const key = `sk-multi-${crypto.randomUUID().split('-')[0]}${crypto.randomUUID().split('-')[1]}`; // Ejemplo: sk-multi-3f4a2b9c
        const query = db.query(`INSERT INTO api_keys (key, name) VALUES ($key, $name) RETURNING *`);
        return query.get({ $key: key, $name: name }) as ApiKey;
    },

    // Listar todas las llaves
    listKeys: (): ApiKey[] => {
        return db.query("SELECT * FROM api_keys ORDER BY created_at DESC").all() as ApiKey[];
    },

    // Eliminar llave
    deleteKey: (id: number) => {
        db.run("DELETE FROM api_keys WHERE id = ?", [id]);
    },

    // Validar y actualizar uso
    validateAndTrack: (key: string): boolean => {
        const record = db.query("SELECT id FROM api_keys WHERE key = $key").get({ $key: key });
        if (record) {
            // Actualizar contador y timestamp (async fire & forget idealmente, pero SQLite es rápido)
            db.run("UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE key = ?", [key]);
            return true;
        }
        return false;
    }
};
