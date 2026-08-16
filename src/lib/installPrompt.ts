type BeforeInstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = (available: boolean) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<Listener>();

function emit() {
  const available = deferredPrompt !== null;
  for (const listener of listeners) listener(available);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    emit();
  });
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  listener(deferredPrompt !== null);
  return () => {
    listeners.delete(listener);
  };
}

export async function promptInstall(): Promise<boolean> {
  const prompt = deferredPrompt;
  if (!prompt) return false;
  deferredPrompt = null;
  emit();
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === "accepted";
}
