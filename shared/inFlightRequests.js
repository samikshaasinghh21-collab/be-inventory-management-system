// Share concurrent reads without caching completed or failed responses.
export const createInFlightRequests = () => {
  const pending = new Map();
  return {
    clear: () => pending.clear(),
    run(key, request) {
      if (pending.has(key)) return pending.get(key);
      const promise = Promise.resolve().then(request).finally(() => {
        if (pending.get(key) === promise) pending.delete(key);
      });
      pending.set(key, promise);
      return promise;
    },
  };
};
