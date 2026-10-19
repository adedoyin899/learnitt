import { PGlite } from "@electric-sql/pglite";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";

/**
 * Creates a Supabase-compatible client facade around an in-memory PGlite instance.
 * Allows running integration tests against real Postgres tables (ai_jobs, ai_cache, usage_counters)
 * using standard Supabase query syntax without requiring an external Supabase server or Docker.
 */
export function createPgliteSupabaseAdapter(pg: PGlite): SupabaseClient<Database> {
  const adapter = {
    from(table: string) {
      let selectedCols = "*";
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      let limitCount: number | null = null;
      let orderCol: string | null = null;
      let orderAsc: boolean = true;
      let orClause: string | null = null;

      async function executeSelect() {
        try {
          let sql = `SELECT ${selectedCols} FROM public.${table}`;
          const whereParts: string[] = [];
          const params: unknown[] = [];

          for (const f of filters) {
            if (f.op === "IN") {
              const list = f.val as unknown[];
              if (list.length === 0) {
                whereParts.push("1 = 0");
              } else {
                const placeholders = list.map((v) => {
                  params.push(v);
                  return `$${params.length}`;
                });
                whereParts.push(`${f.col} IN (${placeholders.join(", ")})`);
              }
            } else {
              params.push(f.val);
              whereParts.push(`${f.col} ${f.op} $${params.length}`);
            }
          }

          if (orClause) {
            if (orClause.includes("status.eq.queued")) {
              whereParts.push(
                `(status = 'queued' OR (status = 'running' AND (locked_until IS NULL OR locked_until < now())))`
              );
            }
          }

          if (whereParts.length > 0) {
            sql += ` WHERE ` + whereParts.join(" AND ");
          }

          if (orderCol) {
            sql += ` ORDER BY ${orderCol} ${orderAsc ? "ASC" : "DESC"}`;
          }

          if (limitCount !== null) {
            sql += ` LIMIT ${limitCount}`;
          }

          const res = await pg.query(sql, params);
          return { data: res.rows, error: null };
        } catch (err: unknown) {
          return { data: null, error: { message: (err as Error).message } };
        }
      }

      const builder = {
        select(cols: string = "*") {
          selectedCols = cols;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, op: "=", val });
          return builder;
        },
        neq(col: string, val: unknown) {
          filters.push({ col, op: "<>", val });
          return builder;
        },
        in(col: string, vals: unknown[]) {
          filters.push({ col, op: "IN", val: vals });
          return builder;
        },
        lte(col: string, val: unknown) {
          filters.push({ col, op: "<=", val });
          return builder;
        },
        gte(col: string, val: unknown) {
          filters.push({ col, op: ">=", val });
          return builder;
        },
        or(clause: string) {
          orClause = clause;
          return builder;
        },
        order(col: string, options?: { ascending?: boolean }) {
          orderCol = col;
          orderAsc = options?.ascending !== false;
          return builder;
        },
        limit(count: number) {
          limitCount = count;
          return builder;
        },

        // Execution methods for select
        async maybeSingle() {
          const res = await executeSelect();
          return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: res.error };
        },

        async single() {
          const res = await executeSelect();
          if (res.error) return { data: null, error: res.error };
          if (!res.data || res.data.length === 0) {
            return {
              data: null,
              error: { message: "JSON object requested, multiple (or no) rows returned" },
            };
          }
          return { data: res.data[0], error: null };
        },

        then(resolve: (value: { data: unknown; error: unknown }) => void) {
          executeSelect().then(resolve);
        },

        insert(records: Record<string, unknown> | Array<Record<string, unknown>>) {
          const rows = Array.isArray(records) ? records : [records];

          async function doInsert() {
            if (rows.length === 0) return { data: [], error: null };
            const first = rows[0];
            const cols = Object.keys(first);
            const valuesClauses: string[] = [];
            const allParams: unknown[] = [];

            for (const row of rows) {
              const placeholders: string[] = [];
              for (const col of cols) {
                allParams.push(row[col]);
                placeholders.push(`$${allParams.length}`);
              }
              valuesClauses.push(`(${placeholders.join(", ")})`);
            }

            const sql = `INSERT INTO public.${table} (${cols.join(", ")}) VALUES ${valuesClauses.join(", ")} RETURNING *`;
            try {
              const res = await pg.query(sql, allParams);
              return { data: res.rows, error: null };
            } catch (err: unknown) {
              return { data: null, error: { message: (err as Error).message } };
            }
          }

          const insertBuilder = {
            then(resolve: (value: { data: unknown; error: unknown }) => void) {
              doInsert().then(resolve);
            },
            select(_cols: string = "*") {
              return {
                then(resolve: (value: { data: unknown; error: unknown }) => void) {
                  doInsert().then(resolve);
                },
                async single() {
                  const res = await doInsert();
                  if (res.error) return { data: null, error: res.error };
                  const resRows = res.data as Array<Record<string, unknown>>;
                  return { data: resRows && resRows.length > 0 ? resRows[0] : null, error: null };
                },
              };
            },
          };
          return insertBuilder;
        },

        update(updateData: Record<string, unknown>) {
          const updateFilters: Array<{ col: string; op: string; val: unknown }> = [];
          let updateOrClause: string | null = null;

          async function executeUpdate() {
            try {
              const cols = Object.keys(updateData);
              const setClauses: string[] = [];
              const params: unknown[] = [];

              for (const col of cols) {
                params.push(updateData[col]);
                setClauses.push(`${col} = $${params.length}`);
              }

              let sql = `UPDATE public.${table} SET ${setClauses.join(", ")}`;
              const whereParts: string[] = [];

              for (const f of updateFilters) {
                params.push(f.val);
                whereParts.push(`${f.col} ${f.op} $${params.length}`);
              }

              if (updateOrClause) {
                if (updateOrClause.includes("status.eq.queued")) {
                  whereParts.push(
                    `(status = 'queued' OR (status = 'running' AND (locked_until IS NULL OR locked_until < now())))`
                  );
                }
              }

              if (whereParts.length > 0) {
                sql += ` WHERE ` + whereParts.join(" AND ");
              }

              sql += ` RETURNING *`;
              const res = await pg.query(sql, params);
              return { data: res.rows, error: null };
            } catch (err: unknown) {
              return { data: null, error: { message: (err as Error).message } };
            }
          }

          const updateBuilder = {
            eq(col: string, val: unknown) {
              updateFilters.push({ col, op: "=", val });
              return updateBuilder;
            },
            or(clause: string) {
              updateOrClause = clause;
              return updateBuilder;
            },
            select(_cols: string = "*") {
              return {
                async maybeSingle() {
                  const res = await executeUpdate();
                  return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: res.error };
                },
                async single() {
                  const res = await executeUpdate();
                  return { data: res.data && res.data.length > 0 ? res.data[0] : null, error: res.error };
                },
              };
            },
            then(resolve: (value: { data: unknown; error: unknown }) => void) {
              executeUpdate().then(resolve);
            },
          };

          return updateBuilder;
        },

        delete() {
          const deleteFilters: Array<{ col: string; op: string; val: unknown }> = [];

          async function executeDelete() {
            try {
              let sql = `DELETE FROM public.${table}`;
              const whereParts: string[] = [];
              const params: unknown[] = [];

              for (const f of deleteFilters) {
                if (f.op === "IN") {
                  const list = f.val as unknown[];
                  if (list.length === 0) {
                    whereParts.push("1 = 0");
                  } else {
                    const placeholders = list.map((v) => {
                      params.push(v);
                      return `$${params.length}`;
                    });
                    whereParts.push(`${f.col} IN (${placeholders.join(", ")})`);
                  }
                } else {
                  params.push(f.val);
                  whereParts.push(`${f.col} ${f.op} $${params.length}`);
                }
              }

              if (whereParts.length > 0) {
                sql += ` WHERE ` + whereParts.join(" AND ");
              }
              sql += ` RETURNING *`;
              const res = await pg.query(sql, params);
              return { data: res.rows, error: null };
            } catch (err: unknown) {
              return { data: null, error: { message: (err as Error).message } };
            }
          }

          const deleteBuilder = {
            eq(col: string, val: unknown) {
              deleteFilters.push({ col, op: "=", val });
              return deleteBuilder;
            },
            neq(col: string, val: unknown) {
              deleteFilters.push({ col, op: "<>", val });
              return deleteBuilder;
            },
            in(col: string, vals: unknown[]) {
              deleteFilters.push({ col, op: "IN", val: vals });
              return deleteBuilder;
            },
            select(_cols: string = "*") {
              return {
                then(resolve: (value: { data: unknown; error: unknown }) => void) {
                  executeDelete().then(resolve);
                },
              };
            },
            then(resolve: (value: { data: unknown; error: unknown }) => void) {
              executeDelete().then(resolve);
            },
          };

          return deleteBuilder;
        },

        async upsert(record: Record<string, unknown>, options?: { onConflict?: string }) {
          const cols = Object.keys(record);
          const params = Object.values(record);
          const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
          const onConflictCol = options?.onConflict || "cache_key";

          const updateClauses = cols
            .filter((c) => c !== onConflictCol)
            .map((c) => `${c} = EXCLUDED.${c}`)
            .join(", ");

          const sql = `
            INSERT INTO public.${table} (${cols.join(", ")})
            VALUES (${placeholders})
            ON CONFLICT (${onConflictCol}) DO UPDATE
            SET ${updateClauses}
            RETURNING *
          `;

          try {
            const res = await pg.query(sql, params);
            return { data: res.rows, error: null };
          } catch (err: unknown) {
            return { data: null, error: { message: (err as Error).message } };
          }
        },
      };

      return builder;
    },

    rpc(fn: string, args: Record<string, unknown> = {}) {
      if (fn === "search_material_chunks") {
        const ownerId = args.p_owner_id as string;
        const query = args.p_query as string;
        const goalId = (args.p_goal_id as string) || null;
        const limit = (args.p_limit as number) || 5;

        const sql = `
          SELECT c.id, c.material_id, m.title as material_title, c.ordinal, c.content, c.tokens,
                 ts_rank(c.fts, plainto_tsquery('english', $2)) as rank
          FROM public.material_chunks c
          JOIN public.materials m ON m.id = c.material_id
          WHERE c.owner_id = $1
            AND ($3::uuid IS NULL OR m.goal_id = $3)
            AND c.fts @@ plainto_tsquery('english', $2)
          ORDER BY rank DESC
          LIMIT $4;
        `;

        return {
          async then(resolve: (value: { data: unknown; error: unknown }) => void) {
            try {
              const res = await pg.query(sql, [ownerId, query, goalId, limit]);
              resolve({ data: res.rows, error: null });
            } catch (err: unknown) {
              resolve({ data: null, error: { message: (err as Error).message } });
            }
          },
        };
      }

      return {
        then(resolve: (value: { data: unknown; error: unknown }) => void) {
          resolve({ data: null, error: { message: `Unknown RPC function: ${fn}` } });
        },
      };
    },

    storage: {
      from(_bucket: string) {
        return {
          async createSignedUploadUrl(path: string, options?: { expiresIn: number }) {
            return {
              data: {
                signedUrl: `https://mock-storage.local/upload/${path}?expires=${options?.expiresIn || 300}`,
                token: "mock-upload-token",
                path,
              },
              error: null,
            };
          },
          async createSignedUrl(path: string, expiresIn: number) {
            return {
              data: {
                signedUrl: `https://mock-storage.local/view/${path}?expires=${expiresIn}`,
              },
              error: null,
            };
          },
          async upload(path: string, _data: unknown) {
            return { data: { path }, error: null };
          },
          async download(path: string) {
            const { getMockStorageMap } = await import("@/lib/materials/storage");
            const buf = getMockStorageMap().get(path);
            if (!buf) {
              return { data: null, error: { message: "File not found" } };
            }
            return {
              data: {
                async arrayBuffer() {
                  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                },
              },
              error: null,
            };
          },
        };
      },
    },
  };

  return adapter as unknown as SupabaseClient<Database>;
}
