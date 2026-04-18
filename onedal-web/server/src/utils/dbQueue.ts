import db from "../db";

interface RunQueueTask {
    stmt: string;
    params: any[];
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
}

class DBQueue {
    private queue: RunQueueTask[] = [];
    private isProcessing: boolean = false;

    /**
     * SQLite의 database is locked 오류를 피하기 위해 INSERT/UPDATE/DELETE 등의
     * 쓰기 작업을 비동기 큐에 쌓고 순차적으로 처리합니다.
     * 
     * @param stmt SQL Statement (e.g. "INSERT INTO intel (type, ...) VALUES (?, ...)")
     * @param params 바인딩할 파라미터 배열
     * @returns SQLite의 run() 결과 객체 (lastInsertRowid, changes 포함)
     */
    public runAsync(stmt: string, ...params: any[]): Promise<any> {
        return new Promise((resolve, reject) => {
            this.queue.push({ stmt, params, resolve, reject });
            this.processQueue();
        });
    }

    private async processQueue() {
        // 이미 큐를 소화 중이거나 비어있으면 리턴
        if (this.isProcessing || this.queue.length === 0) return;

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (!task) continue;

            try {
                // SQLite better-sqlite3는 동기식이지만, 
                // 수천 건의 작업이 밀릴 때 Event Loop 블로킹을 방지하기 위해 setImmediate 사용
                await new Promise<void>((resolveInner) => {
                    setImmediate(() => {
                        try {
                            const statement = db.prepare(task.stmt);
                            const result = statement.run(...task.params);
                            task.resolve(result);
                        } catch (err) {
                            console.error(`[DBQueue] ❌ SQL 실행 에러:`, task.stmt, err);
                            task.reject(err);
                        }
                        resolveInner();
                    });
                });
            } catch (err) {
                console.error("[DBQueue] 큐 처리 중 시스템 오류:", err);
            }
        }

        this.isProcessing = false;
    }
}

export const dbQueue = new DBQueue();
