// Johns Command Center — bridge replaces VS Code API
export const vscode: { postMessage(msg: unknown): void } = {
  postMessage: (msg: unknown) => {
    const handler = (window as any).__colyseus_postMessage;
    if (handler) handler(msg);
  }
};
