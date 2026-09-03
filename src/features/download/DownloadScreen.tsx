import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APP_NAME, APP_TAGLINE, APP_URL } from "@/lib/branding";
import { PritioLogo } from "@/components/PritioLogo";

const REPO_OWNER = "aridevmx";
const REPO_NAME = "PRITIO";
const RELEASES_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
// APK servido en el dominio (fallback / distribución directa).
const ANDROID_APK_URL = `${APP_URL}/apk/pritio.apk`;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  published_at: string;
  html_url: string;
  assets: ReleaseAsset[];
}

type Platform = "windows" | "linux" | "mac" | "android" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/windows/i.test(ua)) return "windows";
  if (/linux/i.test(ua)) return "linux";
  if (/mac/i.test(ua)) return "mac";
  return "other";
}

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

function findAsset(release: GitHubRelease, ext: string): ReleaseAsset | undefined {
  return release.assets.find((a) => a.name.toLowerCase().endsWith(ext));
}

function PlatformIcon({ platform }: { platform: Platform }) {
  const common = "h-5 w-5";
  if (platform === "windows") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M3 5.55 10.2 4.6v6.95H3V5.55Zm0 12.9v-6.6h7.2v6.95L3 18.45Zm8.15.76V11.55H21V19.9l-9.85-0.49Zm0-13.26L21 4.6V11H11.15V5.95Z" />
      </svg>
    );
  }
  if (platform === "linux") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <path d="M12 2a3 3 0 0 1 3 3c0 .6-.2 1.2-.5 1.6.9.7 1.5 1.7 1.5 2.9 0 .6-.2 1.2-.5 1.6.9.7 1.5 1.7 1.5 2.9 0 2.5-2.5 4-5 4s-5-1.5-5-4c0-1.2.6-2.2 1.5-2.9A3 3 0 0 1 9 5a3 3 0 0 1 3-3Z" />
        <path d="M9.5 18.5 8 21m6.5-2.5L16 21M12 18v3" />
      </svg>
    );
  }
  if (platform === "android") {
    return (
      <svg className={common} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7.6 14.6a1.4 1.4 0 0 0 2.8 0v-1.6a1.4 1.4 0 0 0-2.8 0v1.6Zm6 0a1.4 1.4 0 0 0 2.8 0v-1.6a1.4 1.4 0 0 0-2.8 0v1.6Zm-8.5.5a.6.6 0 0 0 .6.6h12.6a.6.6 0 0 0 .6-.6v-3.9c0-3.1-2.7-5.6-6.9-5.6S4.9 8.1 4.9 11.2v3.9Zm2.6-8C8.4 5.7 10.2 5 12 5s3.6.7 5.3 2.1l1.1-1.6A11.7 11.7 0 0 0 12 3.5c-2.3 0-4.6.8-6.4 2l1.1 1.6Z" transform="translate(0 1)" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="3" />
      <path d="M9 3v15l3-3 3 3V3" />
    </svg>
  );
}

function DownloadButton({
  asset,
  platform,
  primary,
  disabled,
  hrefFallback,
}: {
  asset: ReleaseAsset | undefined;
  platform: Platform;
  primary: boolean;
  disabled?: boolean;
  hrefFallback?: string;
}) {
  const label =
    platform === "windows" ? "Descargar para Windows" :
    platform === "linux" ? "Descargar para Linux" :
    platform === "mac" ? "Descargar para macOS" :
    platform === "android" ? "Descargar para Android" : "Descargar";

  return (
    <a
      href={asset?.browser_download_url ?? hrefFallback ?? RELEASES_URL}
      download={asset ? undefined : undefined}
      aria-disabled={disabled}
      className={`flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
        primary
          ? "bg-gradient-to-r from-pritio-purple to-pritio-blue text-white shadow-sm hover:opacity-90"
          : "border border-line bg-surface-muted text-ink hover:bg-surface-subtle"
      } ${disabled ? "pointer-events-none opacity-45" : ""}`}
    >
      <PlatformIcon platform={platform} />
      <span>{disabled ? "Próximamente" : label}</span>
      {asset && !disabled && (
        <span className={`text-xs font-semibold ${primary ? "text-white/75" : "text-ink-muted"}`}>
          {formatBytes(asset.size)}
        </span>
      )}
    </a>
  );
}

export function DownloadScreen() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [platform] = useState<Platform>(detectPlatform);

  useEffect(() => {
    let mounted = true;
    fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        return res.json() as Promise<GitHubRelease>;
      })
      .then((data) => {
        if (mounted) setRelease(data);
      })
      .catch(() => {
        if (mounted) setError(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const windowsAsset = release ? findAsset(release, ".exe") : undefined;
  const linuxAsset = release ? findAsset(release, ".appimage") : undefined;
  const androidAsset = release ? findAsset(release, ".apk") : undefined;
  const version = release?.tag_name.replace(/^v/, "") ?? null;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-14">
        <PritioLogo size={56} />
        <h1 className="mt-5 text-center text-2xl font-extrabold text-ink">
          Descarga {APP_NAME}
        </h1>
        <p className="mt-1.5 text-center text-sm leading-relaxed text-ink-muted">
          {APP_TAGLINE}
        </p>

        <div className="mt-8 w-full space-y-2.5">
          {loading && (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-muted py-6 text-sm text-ink-muted">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-pritio-blue" />
              Consultando última versión...
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-line bg-surface-muted px-4 py-5 text-center text-sm leading-relaxed text-ink-muted">
              No se pudo consultar la última versión.
              <br />
              <a
                href={RELEASES_URL}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-pritio-blue hover:underline"
              >
                Ve a las versiones en GitHub
              </a>
              .
            </div>
          )}

          {release && !error && (
            <>
              {version && (
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Versión {version}
                </p>
              )}
              <DownloadButton
                asset={windowsAsset}
                platform="windows"
                primary={platform === "windows"}
              />
              <DownloadButton
                asset={linuxAsset}
                platform="linux"
                primary={platform === "linux"}
              />
              <DownloadButton
                asset={undefined}
                platform="mac"
                primary={platform === "mac"}
                disabled
              />
            </>
          )}
        </div>

        <div className="mt-2.5 w-full space-y-2.5">
          <DownloadButton
            asset={androidAsset}
            platform="android"
            primary={platform === "android"}
            hrefFallback={ANDROID_APK_URL}
          />
          <p className="text-center text-xs leading-relaxed text-ink-muted">
            Android: instala el APK y permite la instalación desde
            "orígenes desconocidos".
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          {release && (
            <a href={release.html_url} target="_blank" rel="noreferrer" className="font-semibold text-pritio-blue hover:underline">
              Notas de la versión
            </a>
          )}
          <Link to="/" className="font-semibold text-pritio-blue hover:underline">
            Ir a la app
          </Link>
        </div>
      </main>
    </div>
  );
}
