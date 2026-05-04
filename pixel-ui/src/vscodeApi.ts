// Johns Command Center — bridge replaces VS Code API
export const vscode: { postMessage(msg: unknown): void } = {
  postMessage: (msg: unknown) => {
    window.__colyseus_postMessage?.(msg);
  }
};
