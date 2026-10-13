declare module 'pg' {
  export class Pool {
    constructor(options?: unknown);
    connect(): Promise<PoolClient>;
    query(query: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    end(): Promise<void>;
  }
  export interface PoolClient {
    query(query: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
    release(): void;
  }
}
