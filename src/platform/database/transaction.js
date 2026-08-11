export function createPostgresTransactionRunner({ pool, createContext = (context) => context }) {
  if (!pool?.connect) throw new Error("A PostgreSQL pool is required.");
  return Object.freeze({
    async run(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work(createContext(createTransactionContext(client)));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

function createTransactionContext(client) {
  return Object.freeze({ query: (text, values) => client.query(text, values), client });
}
