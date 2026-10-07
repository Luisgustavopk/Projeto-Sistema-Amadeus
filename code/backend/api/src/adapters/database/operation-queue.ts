import type { Client, Transaction, TransactionMode } from '@libsql/client';

/** Short database operations share a FIFO; no network inference belongs in a transaction. */
export function coordinateDatabaseOperations(client: Client): Client {
  let previous = Promise.resolve();
  const transactions = new Set<() => void>();

  async function acquire() {
    const preceding = previous;

    let finish = () => {};

    previous = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await preceding;
    let released = false;

    return () => {
      if (!released) {
        released = true;
        finish();
      }
    };
  }

  async function run<T>(operation: () => Promise<T>) {
    const release = await acquire();

    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function transaction(mode?: TransactionMode) {
    const release = await acquire();
    let tx: Transaction;

    try {
      tx = await client.transaction(mode);
    } catch (error) {
      release();

      throw error;
    }

    const finish = () => {
      transactions.delete(finish);
      release();
    };

    transactions.add(finish);

    return new Proxy(tx, {
      get(target, property) {
        if (property === 'commit' || property === 'rollback') {
          return async () => {
            try {
              await target[property]();
            } finally {
              finish();
            }
          };
        }

        if (property === 'close') {
          return () => {
            try {
              target.close();
            } finally {
              finish();
            }
          };
        }

        const value = Reflect.get(target, property, target);

        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }

  return new Proxy(client, {
    get(target, property) {
      if (property === 'transaction') {
        return transaction;
      }

      if (property === 'close') {
        return () => {
          target.close();

          for (const finish of [...transactions]) {
            finish();
          }
        };
      }

      if (
        ['execute', 'batch', 'migrate', 'executeMultiple', 'sync'].includes(
          String(property),
        )
      ) {
        return (...args: unknown[]) =>
          run(async () =>
            Reflect.apply(Reflect.get(target, property, target), target, args),
          );
      }

      const value = Reflect.get(target, property, target);

      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
